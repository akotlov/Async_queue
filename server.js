const cluster = require("cluster");
//const numCPUs = require("os").cpus().length;
const numCPUs = 2;

const express = require("express");
const bodyParser = require("body-parser");
// const url = require('url');
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
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
app.use(logErrors);
app.use(errorHandler);

require("./api/mongo")(app);
require("./api/api")(app);
require("./api/promise")(app);
require("./api/job_queue")(app);

function logErrors(err, req, res, next) {
  console.error(err.stack);
  next(err);
}
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  res.status(500);
  res.render("error", { error: err });
}

console.log(process.env);

/*process.on("uncaughtException", err => {
  console.error(`Uncaught exception: ${err.stack}`);
  process.exit(1);
});*/

/*if (cluster.isMaster && numCPUs > 1) {
  console.log(`Master ${process.pid} is running`);
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  cluster.on("exit", (worker, code, signal) => {
    console.log(`worker ${worker.process.pid} died`);
    // Replace the dead worker,
    cluster.fork();
  });

  cluster.on("online", worker => {
    console.log(`Worker ${worker.process.pid} is online`);
  });
} else {
  app.post("/create_job_async/*", createJob);
  require("./api/mongo")(app);
}*/

//app.post("/create_job_async/*", createJob);

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

/*
let result = "";
function test(el) {
  if (el === 0) return;
  let char = "*";
  el > 1 ? console.log((result += char)) : console.log((result += char + "/"));
  test(el - 1);
}
test(3);
*/
//console.log(`Worker ${process.pid} started`);
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
