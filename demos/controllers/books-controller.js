let controller = function(
  fs
){
  var self = this;
  
  this.fs = fs.dep;  
};

controller.prototype.retrieve = function(model){
  // return [
  //   { bookId: 1, name: 'Harry Potter' },
  //   { bookId: 2, name: 'Game of Thrones' }
  // ];

  return model;
};

controller.prototype.create = function(model){
  return model;
}

module.exports = controller;
module.exports.$mvcx = { 
  controllerType: 'api',
  requestModelMergeOrder: [
    "headers", "query", "params", "body"
  ],
  actions: {
    retrieve: {
      request: {
        createModel: function(req, onCompleted){
          try{
            let model = {
              headers: req.headers,
              query: req.query,
              params: req.params,
              body: req.body
            };

            onCompleted(null, model);
          }
          catch(error){
            onCompleted(error, null);
          }
        }
      }
    }
  }
};
module.exports.$inject = [
  'fs'
];


