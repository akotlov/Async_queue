const Queue = require("bull");
const async = require("async");
const request = require("request");
const urlExists = require("url-exists");
const shortid = require("shortid");
const Job = require("../models/Job");

// const html2json = require('html2json').html2json;
// const json2html = require('html2json').json2html;
const himalaya = require("himalaya");
const toHTML = require("himalaya/translate").toHTML;
const htmlparser = require("htmlparser2");
const cheerio = require("cheerio");

const htmlParseQueue = new Queue("html_parsing", "redis://127.0.0.1:6379");
const resultQueue = new Queue("Result Queue");

resultQueue.process(function(job, done) {
  console.log("Received message", job.data);
  job.data.result.links.forEach(element => {
    console.log(element);
  });
  done();
});

/*htmlParseQueue.on("completed", (job, result) => {
  console.log("completed job: ", job.id, result);
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
    console.log("saved ", jresult.job_id);
  });
});*/

htmlParseQueue.on("failed", (job, error) => {
  console.log("failed job", error);
});

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
              console.log(
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
      // console.log('Final create_job_async callback return status: ', result.msg);
      res.status(result.status).json(result.payload);
    }
  );
}

module.exports = function(app) {
  app.post("/create_job_async/*", createJob);
};
