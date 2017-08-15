const Queue = require("bull");
// const html2json = require('html2json').html2json;
// const json2html = require('html2json').json2html;
const himalaya = require("himalaya");
const toHTML = require("himalaya/translate").toHTML;
const htmlparser = require("htmlparser2");

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

module.exports = htmlParseQueue;
