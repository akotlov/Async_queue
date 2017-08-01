const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

const Queue = require('bull');

const express = require('express');

const request = require('request');
const shortid = require('shortid');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const async = require('async');
const redis = require('redis');

const Job = require('./models/Job');

const urlExists = require('url-exists');

// const http = require('http');
// const https = require('https');
// const url = require('url');
// const html2json = require('html2json').html2json;
// const json2html = require('html2json').json2html;
const himalaya = require('himalaya');
const toHTML = require('himalaya/translate').toHTML;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json()); // parse application/json
app.use(express.static(`${__dirname}/build/`));

// to allow webpack server app access from another PORT
/* app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
}); */

const mLabURL = 'mongodb://akotlov:asyncjobqueue@ds151289.mlab.com:51289/async-job-queue';
const localDB = 'mongodb://localhost/htmlDB';

// MongoDb default connection pool size is 5.
mongoose.Promise = global.Promise; // this will supress depricarion warning.see https://github.com/Automattic/mongoose/issues/4291
const promise = mongoose.connect(
  localDB,
  {
    useMongoClient: true,
    /* other options */
  },
  /* (err) => {
    if (err) {
      console.log('Unable to connect MongoDB');
      process.exit(1);
    } else {
    }
  }, */
);

promise.then((db) => {
  db.on('error', console.error.bind(console, 'connection error:'));
  db.once('open', () => {
    console.log('connection to db is open');
  });
});

// create a new redis client and connect to our local redis instance
/* const client = redis.createClient();

client.on('error', (err) => {
  console.log(`Error ${err}`);
}); */

function handleError(err, jobID) {
  console.log(err);
  console.log(err.message);
  // console.log('Job ID is : ', jobID);
}

// Generic error handler used by all endpoints.
function handleError1(res, reason, message, code) {
  console.log(`ERROR: ${reason}`);
  res.status(code || 500).json({ error: message });
}

process.on('uncaughtException', (err) => {
  console.log('uncaughtException ', err);
});

const htmlParseQueue = new Queue('html_parsing', 'redis://127.0.0.1:6379');

htmlParseQueue.on('completed', (job, result) => {
  // console.log('completed job: ', job.id);

  const jobResult = new Job({
    job_id: job.id,
    url: job.data.url,
    created_at: Date.now(),
    htmlJSON: result, // json,
    htmlString: null,
    status: 'completed',
    error_msg: null,
  });
  jobResult.save((err, jResult) => {
    if (err) handleError(err);
    console.log('saved ', jResult.job_id);
  });
});

htmlParseQueue.on('failed', (job, error) => {
  console.log(error);
});

htmlParseQueue.process((job, done) => {
  // console.log(job.data, job.id);
  // console.log('Job processing by worker', cluster.worker.id);

  request(job.data.url, (error, response, body) => {
    // console.log(response.headers);
    if (error) done(error);
    console.log('statusCode:', response && response.statusCode);

    try {
      const json = himalaya.parse(body); // html2json(body);
      return done(null, json);
    } catch (ex) {
      done(new Error(ex));
    }
  });
});

if (cluster.isMaster && numCPUs > 1) {
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
} else {
  const server = app.listen(process.env.PORT || 8080, () => {
    const port = server.address().port;
    // console.log('App now running on port', port);
  });

  app.get('/', (req, res) => {
    res.send('Hello World!');
  });

  app.post('/create_job_async/*', (req, res) => {
    const job_url = req.params[0];
    async.waterfall(
      [
        // Task 1
        (callback) => {
          urlExists(job_url, (err, exists) => {
            callback(null, exists);
          });
        },
        // Task 2
        (exists, callback) => {
          console.log(exists);
          if (exists) {
            const jobID = shortid.generate();
            htmlParseQueue.add({ url: job_url }, { jobId: jobID });

            const result = {
              msg: 'Task validated and pushed into a queue',
              status: 200,
              payload: jobID,
            };
            callback(null, result);
          } else {
            // if URL is not "live" or not returned any HTML to parse notify a user
            const result = {
              msg: 'Not a valid url or no HTML returned',
              status: 406,
              payload: 'Not a valid url or no HTML returned',
            };
            callback(null, result);
          }
        },
      ],
      (err, result) => {
        if (err) handleError(err);
        // console.log('Final create_job_async callback return status: ', result.msg);
        res.status(result.status).json(result.payload);
      },
    );
  });
}

app.get('/jobs', (req, res) => {
  Job.find({})
    .select('-htmlJSON') // we exclude this field because of parsed Json size
    .exec((err, jobs) => {
      if (err) return handleError1(res, err.message, 'Failed to get submitted jobs.');
      return res.status(200).json(jobs);
    });
});

app.get('/job/:id', (req, res) => {
  // console.log(req.params.id);
  Job.findOne({ job_id: req.params.id }).populate().exec((error, job) => {
    console.log(job.status);
    if (job.status === 'processing' || job.status === 'error') {
      res.json(job);
    } else {
      job.htmlString = toHTML(job.htmlJSON); // json2html(job.htmlJSON);
      res.json(job);
    }
  });
});

console.log(`Worker ${process.pid} started`);

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
2.The BLATANT violation of REST standart was submitimg data(in this case url string) using GET 
method/endpoint instead of POST.
 */
