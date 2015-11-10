module.exports = function(){
  var self = this;

  this.lazyjs = require('lazyjs');

  this.load = function (modulePath, commonSuffix){
    var fs = require('fs');

    var regex = '/' + commonSuffix + '\.js$/';
    var filePaths = getFilesInDirectory(modulePath, regex);

    var modules = [];
    self.lazyjs(filePaths).each(function(path){
      modules.push({
        filePath: path
        fileName: null,
        moduleName: null,
        module: require(path)
      });
    });

    return modules;
  }

  function getFilesInDirectory(dirPath, filter){

    var path = require('path'), fs=require('fs');

    if (!fs.existsSync(dirPath)){
        return null;
    }

    var files = fs.readdirSync(dirPath);

    var filePaths = [];
    for(var i=0; i<files.length; i++){
        var filename = path.join(dirPath, files[i]);
        var stat = fs.lstatSync(filename);
        if (!stat.isDirectory()){
          filePaths.push(filePath);
        }
    };

    if(filePaths.length > 0){
      return filePaths;
    }
    else{
      return null;
    }
  }
}
