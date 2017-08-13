const cluster = require("cluster");
const numCPUs = require("os").cpus().length;

const express = require("express");
const request = require("request");
const shortid = require("shortid");
const bodyParser = require("body-parser");
const async = require("async");
const Job = require("./models/Job");
const urlExists = require("url-exists");
// const url = require('url');

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

require("./api/api")(app);
require("./api/promise")(app);

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

//console.log(`Worker ${process.pid} started`);
/*
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
