module.exports = function(
  q
){
  var self = this;

  this.q = q.value;

  this.retrieve = function(req){
    return [
      { bookId: 1, name: 'Harry Potter' },
      { bookId: 2, name: 'Game of Thrones' }
    ];
  };
};

module.exports.$inject = [
  'q'
];