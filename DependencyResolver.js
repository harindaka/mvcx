module.exports = function() {
  var self = this;

  var intravenous = require('intravenous');
  this.container = intravenous.create();

  this.compose = function(deps){
    if(typeof(deps) !== 'undefined' && deps != null && deps.length > 0){
      for(var i=0; i < deps.length; i++){
        var dep = deps[i];

        var dependency = null;
        if(dep.lifestyle === 'singleton'){
          dependency = { __intravenousDependency: dep.dependency };
        }
        else{
          dependency = dep.dependency;
        }

        //Supported Lifestyles can be perRequest, unique and singleton
        self.container.register(dep.name, dependency, dep.lifestyle);
      }
    }
  };

  this.resolve = function(name){
    var dependency = self.container.get(name);
    if(typeof(dependency.__intravenousDependency) === 'undefined'){
      return dependency;
    }
    else{
      return dependency.__intravenousDependency;
    }
  };
};
