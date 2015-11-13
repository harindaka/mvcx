module.exports = function(route, status){
  var self = this;

  if(typeof(route) === 'undefined' || route == null || route.trim() === ''){
    throw new Error('[mvcx] Route is not specified.');
  }

  this.route = route;

  if(typeof(status) === 'undefined'){
    this.status = null;
  }
  else{
    this.status = status;
  }
};
