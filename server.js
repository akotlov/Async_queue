const express = require('express');

const app = express();

const shortid = require('shortid');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const async = require('async');
const Job = require('./models/Job');

const urlExists = require('url-exists');

const http = require('http');
const https = require('https');
const url = require('url');
// const html2json = require('html2json').html2json;
// const json2html = require('html2json').json2html;
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

const promise = mongoose.connect(mLabURL, {
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
  console.log('handleError ', err.message, jobID);
  Job.where({ job_id: jobID }).update({ status: 'error', error_msg: err.message }, (err, raw) => {
    if (err) console.log(err); // handleError(err, result.job_id);
    console.log('Updated');
  });
}

// Generic error handler used by all endpoints.
function handleError1(res, reason, message, code) {
  console.log(`ERROR: ${reason}`);
  res.status(code || 500).json({ error: message });
}

const adapterFor = (function () {
  // var url = require('url'),
  const adapters = {
    'http:': http,
    'https:': https,
  };

  return function (inputUrl) {
    return adapters[url.parse(inputUrl).protocol];
  };
}());

process.on('uncaughtException', (err) => {
  console.log('uncaughtException ', err);
});

app.get('/jobs', (req, res) => {
  Job.find({})
    .select('-htmlJSON') // we exclude this field because of its size
    .exec((err, jobs) => {
      if (err) return handleError1(res, err.message, 'Failed to get submitted jobs.');
      res.status(200).json(jobs);
    });
});

app.get('/create_job_async/*', (req, res) => {
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

const q = async.queue((task, callback) => {
  adapterFor(task.url)
    .get(task.url, (res) => {
      const { statusCode } = res;
      const contentType = res.headers['content-type'];
      let error;
      if (statusCode !== 200) {
        error = new Error('Request Failed.\n' + `Status Code: ${statusCode}`);
      }
      if (error) {
        // console.error("Error message ", error.message);
        // consume response data to free up memory
        res.resume();
        callback(error);
        return;
      }

      res.setEncoding('utf8');
      let html = '';
      res.on('data', (data) => {
        html += data;
      });
      res.on('end', (data) => {
        var data = {
          json: himalaya.parse(html),
          job_id: task.job_id,
        };
        callback(null, data);
      });
    })
    .on('error', (err) => {
      callback(err);
    });
}, 100); // TODO see what is optimal number for my needs

function pushIntoQueue(job) {
  q.push([{ url: job.url, job_id: job.job_id }], (err, result) => {
    if (err) return handleError(err, result.job_id);

    console.log('Queue finished processing task with ID ', result.job_id);

    Job.where({ job_id: result.job_id }).update(
      { htmlJSON: result.json, status: 'completed', completed_at: Date.now() },
      (err, raw) => {
        if (err) handleError(err, result.job_id);
        console.log('The raw response from Mongo was ', raw);
      },
    );
  });
}

// assign a callback
q.drain = function () {
  console.log('q.drain all items have been processed');
};

app.get('/job/:id', (req, res) => {
  console.log(req.params.id);
  Job.findOne({ job_id: req.params.id }).populate().exec((error, job) => {
    console.log(job.status);
    if (job.status === 'processing' || job.status === 'error') {
      res.send(job.status);
    } else {
      const backToHTML = toHTML(job.htmlJSON);
      res.send(backToHTML);
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
      isValidUrlRequest.end(); */
