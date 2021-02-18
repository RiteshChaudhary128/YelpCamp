const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
    rating: String,
    comment: String,
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
})

module.exports = mongoose.model('Review', ReviewSchema);