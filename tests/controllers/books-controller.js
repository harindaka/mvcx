module.exports = function(
  q
){
  var self = this;

  this.q = q.value;

  this.retrieve = function(model){
    console.log(this.q);

    return [
      { bookId: 1, name: 'Harry Potter' },
      { bookId: 2, name: 'Game of Thrones' }
    ];
  };
};

module.exports.$type = 'api'
module.exports.$inject = [
  'q'
];


