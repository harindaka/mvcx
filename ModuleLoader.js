module.exports = function(){
  var self = this;

  this.moduleExtension = '.js';
  this.lazyjs = require('lazy.js');

  this.load = function (modulePath, commonSuffix){
    var fs = require('fs');
    var path = require('path');

    var regex = "/" + commonSuffix + "\\" + self.moduleExtension + "$/";
    var filePaths = getFilesInDirectory(modulePath, regex);

    if(filePaths != null){
      var modules = [];
      self.lazyjs(filePaths).each(function(filePath){
        var module = {
          filePath: filePath,
          fileName: path.basename(filePath),
          moduleName: path.basename(filePath, self.moduleExtension)
        };
        
        module.modulePrefix = module.moduleName.substring(0, module.moduleName.length - commonSuffix.length);
        module.moduleSuffix = commonSuffix;
        module.module = require(path.join(modulePath, module.moduleName));

        modules.push(module);
      });
    }

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
        var filePath = path.join(dirPath, files[i]);
        var stat = fs.lstatSync(filePath);
        if (!stat.isDirectory(filePath)){
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
