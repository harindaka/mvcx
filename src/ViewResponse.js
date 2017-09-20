module.exports = function(view, model){
  var self = this;

  if(typeof(view) === 'undefined' || view == null || view.trim() === ''){
    throw new Error('[mvcx] View is not specified.');
  }

  this.view = view;

  if(typeof(model) !== 'undefined'){
    this.model = model;
  }
  else{
    this.model = null;
  }
};
