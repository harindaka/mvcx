function MvcErrorHandlerHook(){
  var self = this;

  this.createResponse = function(config, options){
    if(typeof(options.error) !== 'undefined' && options.error != null){
      var model = {
        errorName: options.error.name,
        errorMessage: options.error.message,
        errorStack: null
      };

      if(options.includeErrorStackInResponse){
        model.errorStack = options.error.stack;
      }

      var path = require('path');
      options.response.status(500).render(path.join(config.internalViewPath, 'error'), model);
    }
    else{
      options.response.status(500);
    }
  }
}

var hook = new MvcErrorHandlerHook();

module.exports = {
  createResponse: hook.createResponse
}
