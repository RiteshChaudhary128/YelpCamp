const mongoose = require('mongoose');
const cities = require('./cities');
const { places, descriptors } = require('./seedHelpers');
const Campground = require('../models/campground');

mongoose.connect('mongodb://localhost:27017/mycamp', {
        useNewUrlParser: true,
        useCreateIndex: true,
        useUnifiedTopology: true
    }).then(() => {
        console.log("database connected");
    })
    .catch(e => {
        console.log("error!!!", e);
    })

mongoose.connection.on('error', err => {
    console.log(err);
});



const sample = (array) => {
    return array[Math.floor(Math.random() * 21)]
};

const seeds = async() => {
    await Campground.deleteMany({});
    for (let i = 0; i < 50; i++) {
        const randNo = Math.floor(Math.random() * 1000);
        const camp = new Campground({
            author: "601ea36ed8df515848fc5e47",
            location: `${cities[randNo].city}, ${cities[randNo].state}`,
            title: `${sample(descriptors)} ${sample(places)}`,
            description: 'Amet dolore consectetur ad duis adipisicing amet in ullamco aute nulla dolor incididunt.',
            price: Math.floor(Math.random() * 25),
            images: [{
                    url: 'https://res.cloudinary.com/vivelafrance/image/upload/v1613224730/Yelpcamp/r4waymqe5nbspxaespq8.jpg',
                    filename: 'Yelpcamp/r4waymqe5nbspxaespq8'
                },
                {
                    url: 'https://res.cloudinary.com/vivelafrance/image/upload/v1613224756/Yelpcamp/uljxpcrzhhasmmvojote.jpg',
                    filename: 'Yelpcamp/uljxpcrzhhasmmvojote'
                }
            ]
        })
        try {
            await camp.save();
        } catch (e) {
            console.log("Error !!!! oops!!!!", e);
        }
    }
}

seeds().then(() => {
    mongoose.connection.close();
})