const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const JobSchema = Schema({
  // TODO have a unique ID assigned //no need - automatically assigned by Mongo on creation
  job_id: String,
  url: String,
  created_at: Number,
  completed_at: Number,
  htmlJSON: Array,
  htmlString: String,
  status: String,
  error_msg: String,
});

module.exports = mongoose.model('Job', JobSchema);
