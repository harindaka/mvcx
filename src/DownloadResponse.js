module.exports = function(filePath, downloadedFilename){
  var self = this;

  if(typeof(filePath) === 'undefined' || filePath == null || filePath.trim() === ''){
    throw new Error('[mvcx] File path is not specified.');
  }

  this.filePath = filePath;

  if(typeof(downloadedFilename) !== 'undefined'){
    this.downloadedFilename = downloadedFilename;
  }
  else{
    this.downloadedFilename = null;
  }
};
