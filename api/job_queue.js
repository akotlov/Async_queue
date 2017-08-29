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

htmlParseQueue.on("completed", (job, result) => {
  console.log("completed job: ", job.id, result);
  // const json = himalaya.parse(body);
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
});

htmlParseQueue.on("failed", (job, error) => {
  handleError(error, job.id);
});

htmlParseQueue.process((job, done) => {
  console.log("Job processing : ", job.id);
  process(job, done);
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

function process(job, done) {
  const maxSize = 1048576;
  console.log(bytesToSize(maxSize));
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
          // const l = (body.length / 1024).toFixed(3);
          const l = bytesToSize(body.length);
          console.log("Resource lenght is", l);
          //let parsedBody;
          let result = {
            url: job.data.url,
            dataLength: l,
            links: []
          };
          /*try {
            parsedBody = parseHtml(body);
            console.log("htmlParseQueue parsedBody :", parsedBody);
            return done(null, parsedBody);
          } catch (e) {
            done(new Error(e));
          }*/
          $ = cheerio.load(body);
          let links = $("a"); //jquery get all hyperlinks
          $(links).each(function(i, link) {
            //console.log($(link).text() + ":\n  " + $(link).attr("href"));
            //console.log($(link).attr("href"));
            urlExists($(link).attr("href"), (err, exists) => {
              if (exists) {
                result.links.push($(link).attr("href"));
                console.log($(link).attr("href"));
              }
            });
          });

          done(null, result);
        });

        res.on("error", error => {
          done(new Error(error));
        });
        res.end();
      }
    }
  );
}

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
