const Queue = require("bull");
const async = require("async");
const request = require("request");
const urlExists = require("url-exists");
const shortid = require("shortid");
const Job = require("../models/Job");

const winston = require("winston");
const logger = new winston.Logger({
  //level: "info",
  transports: [
    // colorize the output to the   console
    new winston.transports.Console({ colorize: true })
    //new winston.transports.File({ filename: "logfile.log" })
  ]
});

//logger.remove(winston.transports.Console);

// const html2json = require('html2json').html2json;
// const json2html = require('html2json').json2html;
const himalaya = require("himalaya");
const toHTML = require("himalaya/translate").toHTML;
const htmlparser = require("htmlparser2");
const cheerio = require("cheerio");

const htmlParseQueue = new Queue("html_parsing", "redis://127.0.0.1:6379");
const resultQueue = new Queue("Result Queue");

let counter = 0;
let startTime = new Date();
let runLoop = true;
let size = 50;

for (let i = 0; i < size; i++) {
  const jobID = shortid.generate();
  htmlParseQueue.add({ index: i }, { jobId: jobID }).then(function(job) {
    logger.log(
      "info",
      "Job ID: " + job.id + " Data: " + JSON.stringify(job.data)
    );
  }, (err, index) => {
    if (err) done(new Error(err));
  });
}

resultQueue.on("completed", (job, result) => {
  logger.log("info", "resultQueue completed job: ", job.id, result);
});

resultQueue.process(function(job, done) {
  let time = (job.data.result.testRunTime / 1000) % 60;
  //logger.log("info", "Received message", time.toFixed(1));
  counter++;
  logger.log("info", "counter: ", counter);
  if (counter >= size) {
    //runLoop = false;
    let endTime = new Date();
    let totalTime = endTime.getTime() - startTime.getTime();
    //logger.log("info", "Operation took " + totalTime + " msec");
    console.log("Operation took " + totalTime + " msec");
  }
  /*if (runLoop) {
  }*/
  done(null, job.data.result);

  /*async.map(job.data.result.links, url => {
    const jobID = shortid.generate();
    htmlParseQueue.add({ url: url }, { jobId: jobID }).then(function(job) {
       logger.log("info","Job ID: " + job.id + " Data: " + JSON.stringify(job.data));
      done();
    }, (err, links) => {
      if (err) done(new Error(err));
      done();
    });
  });

  /*job.data.result.links.forEach(url => {
    const jobID = shortid.generate();
    htmlParseQueue.add({ url: url }, { jobId: jobID }).then(function(job) {
       logger.log("info","Job ID: " + job.id + " Data: " + JSON.stringify(job.data));
      done();
    });
  });*/

  /*const jobResult = new Job({
    job_id: job.id,
    url: job.data.url,
    created_at: Date.now(),
    size: result.dataLength,
    completed_at: Date.now(),
    links: result.links,
    linksCount: result.links.length,
    htmlString: null,
    status: "completed",
    error_msg: null
  });
  jobResult.save((error, jresult) => {
    if (error) logErrors(new Error(error));
     logger.log("info","saved ", jresult.job_id);
  });*/
});

/*htmlParseQueue.on("completed", (job, result) => {
   logger.log("info","completed job: ", job.id, result);
  const jobResult = new Job({
    job_id: job.id,
    url: job.data.url,
    created_at: Date.now(),
    size: result.dataLength,
    completed_at: Date.now(),
    links: result.links,
    linksCount: result.links.length,
    htmlString: null,
    status: "completed",
    error_msg: null
  });
  jobResult.save((error, jresult) => {
    if (error) logErrors(new Error(error));
     logger.log("info","saved ", jresult.job_id);
  });
});

htmlParseQueue.on("failed", (job, error) => {
   logger.log("info","failed job", error);
});*/

function createJob(req, res, next) {
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
        if (exists) {
          const jobID = shortid.generate();
          htmlParseQueue
            .add({ url: job_url }, { jobId: jobID })
            .then(function(job) {
              logger.log(
                "info",
                "Job ID: " + job.id + " Data: " + JSON.stringify(job.data)
              );
            });

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
      if (err) next(err);
      //   logger.log("info",'Final create_job_async callback return status: ', result.msg);
      res.status(result.status).json(result.payload);
    }
  );
}

module.exports = function(app) {
  app.post("/create_job_async/*", createJob);
};
