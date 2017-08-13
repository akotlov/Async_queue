module.exports = function(app) {
  app.post("/promise/:value", usePromise);
};

function Promise(fn) {
  var state = "pending";
  var value;
  var deferred = null;

  function resolve(newValue) {
    if (newValue && typeof newValue.then === "function") {
      newValue.then(resolve);
      return;
    }
    state = "resolved";
    value = newValue;

    if (deferred) {
      handle(deferred);
    }
  }

  function reject(reason) {
    state = "rejected";
    value = reason;

    if (deferred) {
      handle(deferred);
    }
  }

  function handle(handler) {
    if (state === "pending") {
      deferred = handler;
      return;
    }

    var handlerCallback;

    if (state === "resolved") {
      handlerCallback = handler.onResolved;
    } else {
      handlerCallback = handler.onRejected;
    }

    if (!handlerCallback) {
      if (state === "resolved") {
        handler.resolve(value);
      } else {
        handler.reject(value);
      }

      return;
    }

    var ret = handlerCallback(value);
    handler.resolve(ret);
  }

  this.then = function(onResolved, onRejected) {
    return new Promise(function(resolve, reject) {
      handle({
        onResolved: onResolved,
        onRejected: onRejected,
        resolve: resolve,
        reject: reject
      });
    });
  };

  fn(resolve, reject);
}

function doSomething(value) {
  return new Promise(function(resolve, reject) {
    let result = {};
    if (value === "error") {
      result["error"] = "error";
    } else {
      result["value"] = value;
    }
    if (result.error) {
      reject(result.error);
    } else {
      resolve(result.value);
    }
  });
}

function usePromise(req, res, next) {
  console.log(req.params.value);
  let p = doSomething(req.params.value);
  p
    .then(
      function(value) {
        console.log("Got a value:", value);
        return value + "1";
      },
      function(error) {
        console.log("Uh oh", error);
      }
    )
    .then(function(value) {
      console.log("Got a value:", value);
      res.send(value);
    });
}
