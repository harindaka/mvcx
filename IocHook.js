function IocHook(){
  var self = this;

  var intravenous = require('intravenous');
  this.container = intravenous.create();

  this.register = function(dep){
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

  this.resolve = function(name){
    var dependency = self.container.get(name);
    if(typeof(dependency.__intravenousDependency) === 'undefined'){
      return dependency;
    }
    else{
      return dependency.__intravenousDependency;
    }
  };
}

var hook = new IocHook();

module.exports = {
  register: hook.register,
  resolve: hook.resolve
};
