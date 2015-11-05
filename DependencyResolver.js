module.exports = function() {
  var self = this;

  var intravenous = require('intravenous');
  this.container = intravenous.create();

  this.compose = function(deps){
    if(typeof(deps) !== 'undefined' && deps != null && deps.length > 0){
      for(var i=0; i < deps.length; i++){
        var dep = deps[i];
        self.container.register(dep.name, dep.dependency, dep.lifestyle);
      }
    }
  };

  this.resolve = function(name){
    return self.container.get(name);
  };
};
