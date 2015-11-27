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

      var path = require('path');
      var viewPath = path.join(__dirname, '../', 'views/Error')
      res.status(500).render(viewPath, responseBody);
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
