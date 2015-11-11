function IocHook(){
  var self = this;

  var intravenous = require('intravenous');
  this.container = intravenous.create();

  this.register = function(name, dependency, lifestyle){
    //Supported Lifestyles can be perRequest, unique and singleton
    self.container.register(name, dependency, lifestyle);
  }

  this.resolve = function(dependencyName){
    return self.container.get(dependencyName);
  };
}

var hook = new IocHook();

module.exports = {
  register: hook.register,
  resolve: hook.resolve
};
