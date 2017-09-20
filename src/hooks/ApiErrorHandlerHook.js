function ApiErrorHandlerHook(){
  var self = this;

  this.createResponse = function(config, options){
    if(typeof(options.error) !== 'undefined' && options.error != null){
      var responseBody = {
        errorName: options.error.name,
        errorMessage: options.error.message,
        errorStack: null
      };

      if(options.includeErrorStackInResponse){
        responseBody.errorStack = options.error.stack;
      }

      options.response.status(500).json(responseBody);
    }
    else{
      options.response.status(500);
    }
  }
}

var hook = new ApiErrorHandlerHook();

module.exports = {
  createResponse: hook.createResponse
}
