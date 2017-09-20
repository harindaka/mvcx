module.exports = function(filePath, options){
  var self = this;

  if(typeof(filePath) === 'undefined' || filePath == null || filePath.trim() === ''){
    throw new Error('[mvcx] File path is not specified.');
  }

  this.filePath = filePath;

  if(typeof(options) !== 'undefined'){
    this.options = options;
  }
  else{
    this.options = null;
  }
};
