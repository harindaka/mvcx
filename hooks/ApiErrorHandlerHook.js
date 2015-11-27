function ErrorHandlerHook(){
  var self = this;

  this.createResponse = function(res, e, includeErrorStackInResponse){
    if(typeof(e) !== 'undefined' && e != null){
      var responseBody = {
        errorName: e.name,
        errorMessage: e.message,
        errorStack: null
      };

      if(includeErrorStackInResponse){
        responseBody.errorStack = e.stack;
      }

      res.status(500);
      res.json(responseBody);
    }
    else{
      res.status(500);
    }
  }
}

var hook = new ErrorHandlerHook();

module.exports = {
  createResponse: hook.createResponse
}
