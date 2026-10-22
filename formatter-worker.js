"use strict";
importScripts("vendor/formatter.bundle.js");
self.onmessage = event => {
  const { input, options } = event.data;
  self.postMessage(WorkflowFormatter.analyze(input, options));
};
