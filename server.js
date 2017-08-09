const cluster = require("cluster");
const numCPUs = require("os").cpus().length;

const Queue = require("bull");

const express = require("express");

const request = require("request");
const shortid = require("shortid");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const async = require("async");
const redis = require("redis");
const sf = require("sf");

const Job = require("./models/Job");

const urlExists = require("url-exists");

// const http = require('http');
// const https = require('https');
// const url = require('url');
// const html2json = require('html2json').html2json;
// const json2html = require('html2json').json2html;
const himalaya = require("himalaya");
const toHTML = require("himalaya/translate").toHTML;

const htmlparser = require("htmlparser2");

const foldingCharacter = ":";
const prefix = "bull:html_parsing";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json()); // parse application/json
app.use(express.static(`${__dirname}/build/`));

// to allow webpack server app access from another PORT
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

const mLabURL =
  "mongodb://akotlov:asyncjobqueue@ds151289.mlab.com:51289/async-job-queue";
const localDB = "mongodb://localhost/htmlDB";

// MongoDb default connection pool size is 5.
mongoose.Promise = global.Promise; // this will supress depricarion warning.see https://github.com/Automattic/mongoose/issues/4291
const promise = mongoose.connect(
  localDB,
  {
    useMongoClient: true
    /* other options */
  },
  err => {
    if (err) {
      console.log("Unable to connect MongoDB");
      process.exit(1);
    } else {
      const server = app.listen(process.env.PORT || 8080, () => {
        const port = server.address().port;
        console.log("App now running on port", port);
      });
    }
  }
);

promise.then(db => {
  db.on("error", console.error.bind(console, "connection error:"));
  db.once("open", () => {
    console.log("connection to db is open");
  });
});

// create a new redis client and connect to our local redis instance
const redisClient = redis.createClient();

redisClient.on("error", err => {
  console.log(`Error ${err}`);
});

/* client.monitor(function (err, res) {
  console.log("Entering monitoring mode.");
});

client.on("monitor", function (time, args, raw_reply) {
  console.log(time + ": " + args); // 1458910076.446514:['set', 'foo', 'bar']
}); */

function handleError(err, jobID) {
  console.log("handleError ", err);
  console.log("handleError ", err.message);
  // console.log('Job ID is : ', jobID);
}

// Generic error handler used by all endpoints.
function handleError1(res, reason, message, code) {
  console.log(`ERROR: ${reason}`);
  res.status(code || 500).json({ error: message });
}

process.on("uncaughtException", err => {
  console.error(`Uncaught exception: ${err.stack}`);
  process.exit(1);
});

/* if (cluster.isMaster && numCPUs > 1) {
  console.log(`Master ${process.pid} is running`);
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  cluster.on('exit', (worker, code, signal) => {
    console.log(`worker ${worker.process.pid} died`);
    // Replace the dead worker,
    cluster.fork();
  });

  cluster.on('online', (worker) => {
    console.log(`Worker ${worker.process.pid} is online`);
  });
} else { */

/*
app.get('/', (req, res) => {
    res.send('Hello World!');
  }); */

const htmlParseQueue = new Queue("html_parsing", "redis://127.0.0.1:6379");

htmlParseQueue.on("completed", (job, result) => {
  console.log("completed job: ", job.id, result);
});

htmlParseQueue.on("failed", (job, error) => {
  handleError(error, job.id);
});

/* function parseHtml(html, done) {
    let parsed;
    try {
      parsed = himalaya.parse(html);
    } catch (ex) {
      done(new Error(ex));
      // return null; // Oh well, but whatever...
    }

    return parsed; // Could be undefined!
  }
*/

function parseHtml(data) {
  const tags = [];
  const tagsCount = {};
  const tagsWithCount = [];

  const handler = new htmlparser.DomHandler((error, dom) => {
    console.log(dom);
  });

  const parsedData = new htmlparser.Parser(
    {
      onopentag(name, attribs) {
        if (tags.indexOf(name) === -1) {
          tags.push(name);
          tagsCount[name] = 1;
        } else {
          tagsCount[name]++;
        }
      },
      onend() {
        for (let i = 1; i < tags.length; i++) {
          tagsWithCount.push({ name: tags[i], count: tagsCount[tags[i]] });
        }
      }
    },
    { decodeEntities: true }
  );

  parsedData.write(data);
  parsedData.end();
  // console.log(tagsWithCount);
  return tagsWithCount;
}

function bytesToSize(bytes) {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (bytes === 0) return "n/a";
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
  if (i === 0) return `${bytes} ${sizes[i]})`;
  return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
}

htmlParseQueue.process((job, done) => {
  // console.log('Job processing by worker', cluster.worker.id);
  /* request(job.data.url, (error, response, body) => {
    if (error) done(error);
    console.log('statusCode:', response && response.statusCode);
  }); */
  const maxSize = 1048576;
  request(
    {
      url: job.data.url,
      method: "HEAD"
    },
    (err, headRes) => {
      const size = headRes.headers["content-length"];
      if (size > maxSize) {
        console.log(`Resource size exceeds limit (${size})`);
        done(new Error("Resource stream exceeded limit"));
      } else {
        let dataSize = 0;
        let body = "";

        const res = request({ url: job.data.url });

        res.on("data", data => {
          dataSize += data.length;

          if (dataSize > maxSize) {
            console.log(`Resource stream exceeded limit (${dataSize})`);
            done(new Error("Resource stream exceeded limit"));
            res.abort(); // Abort the response (close and cleanup the stream)
          }
          body += data;
        });
        res.on("end", () => {
          // console.log(`BODY: ${body}`);
          // const l = (body.length / 1024).toFixed(3);
          const l = bytesToSize(body.length);
          console.log("Resource lenght is", l);
          const parsedBody = parseHtml(body);
          // const json = himalaya.parse(body);
          const jobResult = new Job({
            job_id: job.id,
            url: job.data.url,
            created_at: Date.now(),
            size: l,
            htmlJSON: parsedBody,
            htmlString: null,
            status: "completed",
            error_msg: null
          });
          jobResult.save((error, jresult) => {
            if (err) done(new Error(error));
            // console.log('saved ', jresult.job_id);
            return done(null, jresult.url);
          });
        });
        res.on("error", error => {
          done(new Error(error));
        });
        res.end();
      }
    }
  );
});

app.post("/create_job_async/*", (req, res) => {
  const job_url = req.params[0];
  async.waterfall(
    [
      // Task 1
      callback => {
        urlExists(job_url, (err, exists) => {
          callback(null, exists);
        });
      },
      // Task 2
      (exists, callback) => {
        // console.log(exists);
        if (exists) {
          const jobID = shortid.generate();
          htmlParseQueue.add({ url: job_url }, { jobId: jobID });

          const result = {
            msg: "Task validated and pushed into a queue",
            status: 200,
            payload: jobID
          };
          callback(null, result);
        } else {
          // if URL is not "live" or not returned any HTML to parse notify a user
          const result = {
            msg: "Not a valid url or no HTML returned",
            status: 406,
            payload: "Not a valid url or no HTML returned"
          };
          callback(null, result);
        }
      }
    ],
    (err, result) => {
      if (err) handleError(err);
      // console.log('Final create_job_async callback return status: ', result.msg);
      res.status(result.status).json(result.payload);
    }
  );
});
// }
app.get("/jobs", (req, res) => {
  const limit = 200;

  distinct = function(items) {
    var hash = {};
    items.forEach(function(item) {
      hash[item] = true;
    });
    var result = [];
    for (var item in hash) {
      result.push(item);
    }
    return result;
  };

  redisClient.keys(`${prefix}*`, (err, keys) => {
    if (err) {
      console.error("getKeys", err);
      return next(err);
    }
    console.log(sf('found {0} keys for "{1}"', keys.length, prefix));

    if (keys.length > 1) {
      keys = distinct(
        keys.map(function(key) {
          var idx = key.indexOf(foldingCharacter, prefix.length);
          if (idx > 0) {
            return key.substring(0, idx + 1);
          }
          return key;
        })
      );
    }

    if (keys.length > limit) {
      keys = keys.slice(0, limit);
    }

    keys = keys.sort();
    //res.send(JSON.stringify(keys));
    console.log(keys);
    res.send(JSON.stringify(keys));
  });

  /*Job.find({})
    .select("-htmlJSON") // we exclude this field because of parsed Json size
    .exec((err, jobs) => {
      if (err)
        return handleError1(res, err.message, "Failed to get submitted jobs.");
      return res.status(200).json(jobs);
    });*/
});

app.get("/job/:id", (req, res) => {
  // console.log(req.params.id);
  Job.findOne({ job_id: req.params.id }).populate().exec((error, job) => {
    console.log(job.status);
    if (job.status === "processing" || job.status === "error") {
      res.json(job);
    } else {
      res.json(job);
    }
  });
});

console.log(`Worker ${process.pid} started`);

app.get("/api/jobs", (req, res) => {
  let cursor = "0";

  redisClient.scan(cursor, "MATCH", prefix + "*", "COUNT", "50", function(
    err,
    reply
  ) {
    if (err) {
      console.error("getKeys", err);
      return next(err);
    }
    cursor = reply[0];
    if (cursor === "0") {
      return console.log("Scan Complete");
    } else {
      console.log(sf('found {0} keys for "{1}"', reply[1].length, prefix));

      var lookup = {};
      var reducedKeys = [];
      reply[1].forEach(function(key) {
        var fullKey = key;
        if (prefix) {
          key = key.substr((prefix + foldingCharacter).length);
        }
        var parts = key.split(foldingCharacter);
        var firstPrefix = parts[0];
        if (lookup.hasOwnProperty(firstPrefix)) {
          lookup[firstPrefix].count++;
        } else {
          lookup[firstPrefix] = {
            attr: { id: firstPrefix },
            count: parts.length === 1 ? 0 : 1
          };
          lookup[firstPrefix].fullKey = fullKey;
          if (parts.length === 1) {
            lookup[firstPrefix].leaf = true;
          }
          reducedKeys.push(lookup[firstPrefix]);
        }
      });
      //console.log(reducedKeys);

      reducedKeys.forEach(function(data) {
        if (data.count === 0) {
          data.data = data.attr.id;
        } else {
          data.data = data.attr.id + ":* (" + data.count + ")";
          data.state = "closed";
        }
      });

      async.forEachLimit(
        reducedKeys,
        10,
        function(keyData, callback) {
          if (keyData.leaf) {
            redisClient.type(keyData.fullKey, function(err, type) {
              if (err) {
                return callback(err);
              }
              keyData.attr.rel = type;
              var sizeCallback = function(err, count) {
                if (err) {
                  return callback(err);
                } else {
                  keyData.data += " (" + count + ")";
                  callback();
                }
              };
              if (type == "list") {
                redisClient.llen(keyData.fullKey, sizeCallback);
              } else if (type == "set") {
                redisClient.scard(keyData.fullKey, sizeCallback);
              } else if (type == "zset") {
                redisClient.zcard(keyData.fullKey, sizeCallback);
              } else {
                callback();
              }
            });
          } else {
            callback();
          }
        },
        function(err) {
          if (err) {
            console.error("getKeys", err);
            return next(err);
          }
          reducedKeys = reducedKeys.sort(function(a, b) {
            return a.data > b.data ? 1 : -1;
          });
          console.log(reducedKeys);
          res.send(JSON.stringify(reducedKeys));
        }
      );
    }
    /*
    cursor = reply[0];
    if (cursor === "0") {
      return console.log("Scan Complete");
    } else {
      console.log(reply[1]);
      const jobs = JSON.stringify(reply[1]);
      res.json(reply[1]);
      //return scan();
    }*/
  });
});

app.get("/api/job/:id", (req, res) => {
  const jobID = req.params.id;
  console.log(jobID);

  redisClient.hgetall(jobID, function(err, fieldsAndValues) {
    if (err) {
      console.error("getKeys", err);
      return next(err);
    }
    console.log(fieldsAndValues);
    var details = {
      key: jobID,
      type: "hash",
      data: fieldsAndValues
    };
    /*cursor = reply[0];
    if (cursor === "0") {
      return console.log("Scan Complete");
    } else {*/
    // do your processing
    // reply[1] is an array of matched keys.
    res.json(details);
    //return scan();
  });
});

/*var cursor2 = "0";

redisClient.zscan("bull:html_parsing:failed", cursor2, "COUNT", "10", function(
  err,
  reply
) {
  if (err) {
    throw err;
  }
  console.log(reply);
  cursor2 = reply[0];
  if (cursor2 === "0") {
    return console.log("Scan Complete");
  } else {
    // do your processing
    // reply[1] is an array of matched keys.
    console.log(JSON.stringify(reply[1]));
    //return scan();
  }
});

var cursor3 = "0";

redisClient.hscan("bull:html_parsing:ByicbxkwW", cursor3, function(err, reply) {
  if (err) {
    throw err;
  }
  console.log(reply);
  cursor3 = reply[0];
  if (cursor2 === "0") {
    return console.log("Scan Complete");
  } else {
    // do your processing
    // reply[1] is an array of matched keys.
    console.log(JSON.stringify(reply[1]));
    //return scan();
  }
});*/

/*
TODO:
-check if database is available before we init our app
-when using cluster module check what code should run inside child processes ,
for example DB connections? Answer- will have one db connection per process.
-what if master process crashes first?What would happen to its slave processes?
-remove console.log statements,use debug
 -check if headers has 'x-frame-options': 'SAMEORIGIN' -
it will prevent browser from displaying HTML in iframe.

*/

// var options = {method: 'HEAD', host: url.parse(job_url).host, /*port: 80, path: '/'*/};

/* var isValidUrlRequest = adapterFor(job_url).request(options, function(r) {
            console.log(JSON.stringify(r.statusCode));
            callback(null, r.statusCode);
        });
      isValidUrlRequest.end(); 

      if (typeof job_url !== 'string') {
        handleError(new Error('url should be a string'));
        return;
      } */

/*
1.Massdrop html content wont display in iframe because of 'x-frame-options': 'SAMEORIGIN' 
option in header.  
 */
