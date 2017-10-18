let controller = function(
  fs
){
  var self = this;
  
  this.fs = fs.dep;  
};

controller.prototype.retrieve = function(model, respond){
  // return [
  //   { bookId: 1, name: 'Harry Potter' },
  //   { bookId: 2, name: 'Game of Thrones' }
  // ];

  respond(null, model);
};

controller.prototype.create = function(model, respond){
  respond(null, model);
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
        validate: function(req, schemaValidate, onCompleted){
          try{
            onCompleted(null, null);
          }
          catch(error){
            onCompleted(error, null);
          }
        },
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


