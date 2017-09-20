module.exports = function(responseHandlerFn){
  var self = this;

  if(typeof(responseHandlerFn) === 'function'){
    throw new Error('[mvcx] Invalid response handler function specified.');
  }

  this.handler = responseHandlerFn;
};
