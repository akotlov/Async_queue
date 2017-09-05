const cluster = require("cluster");
//const numCPUs = require("os").cpus().length;
const numCPUs = 1;

const winston = require("winston");
const logger = new winston.Logger({
  transports: [
    // colorize the output to the console
    new winston.transports.Console({ colorize: true })
  ]
});
logger.level = "debug";
const Job = require("./models/Job");

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

//require("./api/mongo")(app);
require("./api/api")(app);
require("./api/promise")(app);
require("./api/job_queue")(app);

app.get("/test", function(req, res) {
  res.send("Hello World!");
});

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

//console.log(process.env);

/*process.on("uncaughtException", err => {
  console.error(`Uncaught exception: ${err.stack}`);
  process.exit(1);
});*/

/*if you have to debug a huge codebase, and you don't know which Promise can 
potentially hide an issue, you can use the unhandledRejection hook. It will print out all u
nhandled Promise rejections.

process.on('unhandledRejection', (err) => {  
  console.log(err)
})
*/

if (cluster.isMaster && numCPUs > 1) {
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
  require("./api/mongo")(app);
}

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

app.get("/records", (req, res) => {
  Job.find({})
    //.select("-htmlJSON") // we exclude this field because of parsed Json size
    .exec((err, jobs) => {
      if (err) return next(err);
      return res.status(200).json(jobs);
    });
});

function AsyncForEach(arr, cb) {
  arr.forEach(i => {
    setTimeout(() => {
      cb(i);
    }, 0);
    //cb(i);
  });
}

AsyncForEach([1, 2, 3], function(i) {
  //console.log(i);
  return i;
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

/*
 // HOW and WHY the timers implementation works the way it does.
//
// Timers are crucial to Node.js. Internally, any TCP I/O connection creates a
// timer so that we can time out of connections. Additionally, many user
// libraries and applications also use timers. As such there may be a
// significantly large amount of timeouts scheduled at any given time.
// Therefore, it is very important that the timers implementation is performant
// and efficient.
//
// Note: It is suggested you first read though the lib/internal/linkedlist.js
// linked list implementation, since timers depend on it extensively. It can be
// somewhat counter-intuitive at first, as it is not actually a class. Instead,
// it is a set of helpers that operate on an existing object.
//
// In order to be as performant as possible, the architecture and data
// structures are designed so that they are optimized to handle the following
// use cases as efficiently as possible:

// - Adding a new timer. (insert)
// - Removing an existing timer. (remove)
// - Handling a timer timing out. (timeout)
//
// Whenever possible, the implementation tries to make the complexity of these
// operations as close to constant-time as possible.
// (So that performance is not impacted by the number of scheduled timers.)
//
// Object maps are kept which contain linked lists keyed by their duration in
// milliseconds.
// The linked lists within also have some meta-properties, one of which is a
// TimerWrap C++ handle, which makes the call after the duration to process the
// list it is attached to.
//
//
// ╔════ > Object Map
// ║
// ╠══
// ║ refedLists: { '40': { }, '320': { etc } } (keys of millisecond duration)
// ╚══          ┌─────────┘
//              │
// ╔══          │
// ║ TimersList { _idleNext: { }, _idlePrev: (self), _timer: (TimerWrap) }
// ║         ┌────────────────┘
// ║    ╔══  │                              ^
// ║    ║    { _idleNext: { },  _idlePrev: { }, _onTimeout: (callback) }
// ║    ║      ┌───────────┘
// ║    ║      │                                  ^
// ║    ║      { _idleNext: { etc },  _idlePrev: { }, _onTimeout: (callback) }
// ╠══  ╠══
// ║    ║
// ║    ╚════ >  Actual JavaScript timeouts
// ║
// ╚════ > Linked List
//
//
// With this, virtually constant-time insertion (append), removal, and timeout
// is possible in the JavaScript layer. Any one list of timers is able to be
// sorted by just appending to it because all timers within share the same
// duration. Therefore, any timer added later will always have been scheduled to
// timeout later, thus only needing to be appended.
// Removal from an object-property linked list is also virtually constant-time
// as can be seen in the lib/internal/linkedlist.js implementation.
// Timeouts only need to process any timers due to currently timeout, which will
// always be at the beginning of the list for reasons stated above. Any timers
// after the first one encountered that does not yet need to timeout will also
// always be due to timeout at a later time.
//
// Less-than constant time operations are thus contained in two places:
// TimerWrap's backing libuv timers implementation (a performant heap-based
// queue), and the object map lookup of a specific list by the duration of
// timers within (or creation of a new list).
// However, these operations combined have shown to be trivial in comparison to
// other alternative timers architectures.


// Object maps containing linked lists of timers, keyed and sorted by their
// duration in milliseconds.
//
// The difference between these two objects is that the former contains timers
// that will keep the process open if they are the only thing left, while the
// latter will not.
//
// - key = time in milliseconds
// - value = linked list*/
