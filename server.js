const express = require('express');

const app = express();

const request = require('request');
const shortid = require('shortid');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const async = require('async');
const Job = require('./models/Job');

const urlExists = require('url-exists');

// const http = require('http');
// const https = require('https');
// const url = require('url');
const html2json = require('html2json').html2json;
const json2html = require('html2json').json2html;
const himalaya = require('himalaya');
const toHTML = require('himalaya/translate').toHTML;

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
const promise = mongoose.connect(localDB, {
  useMongoClient: true,
  /* other options */
});

promise.then((db) => {
  db.on('error', console.error.bind(console, 'connection error:'));
  db.once('open', () => {
    console.log('connection to db is open');
  });
});

function handleError(err, jobID) {
  console.log(err);
  console.log(err.message);
  console.log('Job ID is : ', jobID);
}

// Generic error handler used by all endpoints.
function handleError1(res, reason, message, code) {
  console.log(`ERROR: ${reason}`);
  res.status(code || 500).json({ error: message });
}

process.on('uncaughtException', (err) => {
  console.log('uncaughtException ', err);
});

// Async queue logic here..
const q = async.queue((task, callback) => {
  const maxSize = 10485760;
  request(task.url, (error, response, body) => {
    console.log(response.headers); // TODO check if headers has 'x-frame-options': 'SAMEORIGIN' - will prevent browser from displaying HTML in iframe.
    if (error) callback(error);
    console.log('statusCode:', response && response.statusCode);

    let json;
    try {
      // JSON.parse(data)
      json = himalaya.parse(body); // html2json(body);
      console.log(json);
    } catch (ex) {
      return callback(error);
      // return console.log(ex);
    }
    Job.where({ job_id: task.job_id }).update({ htmlJSON: json }, (err, raw) => {
      if (err) return callback(err, task);
      console.log('The raw response from Mongo was ', raw);
      return callback(null, task);
    });
  });
}, 100); // TODO see what is optimal number for my needs

// assign a callback
q.drain = function () {
  console.log('q.drain all items have been processed');
};

function pushIntoQueue(job) {
  q.push([{ url: job.url, job_id: job.job_id }], (error, task) => {
    if (error) {
      Job.where({ job_id: task.job_id }).update(
        { status: 'error', error_msg: error.message },
        (err, raw) => {
          if (err) handleError(err, task.job_id);
          console.log(
            `Queue finished processing task with ID ${task.job_id} and error message: ${error.message}`,
          );
        },
      );
    } else {
      Job.where({ job_id: task.job_id }).update(
        { status: 'completed', completed_at: Date.now() },
        (err, raw) => {
          if (err) handleError(err, task.job_id);
          console.log(`Queue finished processing task with ID ${task.job_id}and status completed`);
        },
      );
    }
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

// POST not GET !!  - changed
app.post('/create_job_async/*', (req, res) => {
  const job_url = req.params[0];

  async.waterfall(
    [
      // Task 1
      // TODO if local server is offline it will return !exist even if url is valid.
      // check if URL is reachable by sending just headers
      function (callback) {
        urlExists(job_url, (err, exists) => {
          callback(null, exists);
        });
      },
      // Task 2
      function (exists, callback) {
        console.log(exists);
        if (exists) {
          // If URL is "live" init a job by saving job info into a database
          const job_id = shortid.generate();
          const job = new Job({
            job_id,
            url: job_url,
            created_at: Date.now(),
            htmlJSON: null,
            htmlString: null,
            status: 'processing',
            error_msg: null,
          });
          job.save((err, job) => {
            if (err) callback(err, job_id);
            pushIntoQueue(job);
            const result = {
              msg: 'Task validated and pushed into a queue',
              status: 200,
              payload: job,
            };
            callback(null, result);
          });
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
      if (err) handleError(err, job_id);
      console.log('Final create_job_async callback return status: ', result.msg);
      res.status(result.status).json(result.payload);
    },
  );
});

app.get('/job/:id', (req, res) => {
  console.log(req.params.id);
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

const server = app.listen(process.env.PORT || 8080, () => {
  const port = server.address().port;
  console.log('App now running on port', port);
});

/*
TODO:
check if database is available before we init our app


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
