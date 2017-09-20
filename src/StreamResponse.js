module.exports = function(contentType, stream){
  var self = this;

  if(typeof(contentType) === 'undefined' || contentType == null){
    throw new Error('[mvcx] Content type is not specified.');
  }

  this.contentType = contentType;

  if(typeof(stream) === 'undefined' || stream == null){
    throw new Error('[mvcx] Stream is not specified.');
  }

  this.stream = stream;
};
