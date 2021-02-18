if (process.env.NODE_ENV !== "production") {
    require('dotenv').config();
}

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const methodOverride = require('method-override');
const ejs = require('ejs');
const ejsMate = require('ejs-mate');
const session = require('express-session');
const flash = require('connect-flash');
const passport = require('passport');
const passportLocal = require('passport-local');
const Campground = require('./models/campground');
const Review = require('./models/review');
const User = require('./models/user');
const catchAsync = require('./utils/catchAsync');
const ExpressEroor = require('./utils/ExpressError');
const { campgroundSchema } = require('./schema.js')
const Joi = require('joi');
const review = require('./models/review');
const { date } = require('joi');
const multer = require('multer');
const { cloudinary, storage } = require('./cloudinary');
const upload = multer({ storage });
//const upload = multer({ dest: 'uploads/' })

mongoose.connect('mongodb://localhost:27017/mycamp', {
        useNewUrlParser: true,
        useCreateIndex: true,
        useUnifiedTopology: true,
        useFindAndModify: false
    }).then(() => {
        console.log("database connected");
    })
    .catch(e => {
        console.log("error!!!", e);
    })
mongoose.connection.on('error', err => {
    console.log(err);
});


const validateCamp = (req, res, next) => {
    const { error } = campgroundSchema.validate(req.body);
    if (error) {
        const msg = error.details.map(el => el.message).join(',');
        throw new ExpressEroor(400, msg)
    } else {
        next();
    }
}

const isLoggedin = (req, res, next) => {
    if (!req.isAuthenticated()) {
        req.session.redirectTo = req.originalUrl;
        req.flash('error', 'You need to logged in');
        return res.redirect('/login')
    }
    next();
}

const isAuthor = catchAsync(async(req, res, next) => {
    const { id } = req.params;
    const campground = await Campground.findById(id);
    if (!campground.author.equals(req.user._id)) {
        req.flash('error', 'You are not authorized to do that');
        return res.redirect(`/campground/${id}`);
    }
    next();
})

const isReviewAuth = catchAsync(async(req, res, next) => {
    const { id1, id2 } = req.params;
    const review = await Review.findById(id2);
    if (!review.author.equals(req.user._id)) {
        req.flash('error', 'You are not Authorized');
        return res.redirect(`/campground/${id1}`);
    }
    next();
});


const app = express();
app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

const sessionProperty = {
    secret: 'thisissecret',
    saveUninitialized: true,
    resave: false,
    cookie: {
        expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        httpOnly: true
    }
}
app.use(session(sessionProperty));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new passportLocal(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
    res.locals.currentUser = req.user;
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
})


app.get('/', (req, res) => {
    res.render('home')
});

app.get('/campground', catchAsync(async(req, res) => {
    const campgrounds = await Campground.find();
    res.render('campground/index', { campgrounds });
}));

app.get('/campground/new', isLoggedin, (req, res) => {
    res.render('campground/new');
});

app.post('/campground', isLoggedin, upload.array('image'), validateCamp, catchAsync(async(req, res) => {

    const campground = new Campground(req.body.campground);
    campground.images = req.files.map(f => ({ url: f.path, filename: f.filename }));
    campground.author = req.user._id;
    await campground.save();
    console.log(campground);
    req.flash('success', 'successesfully created new campground');
    res.redirect(`/campground/${campground._id}`);
}));

app.post('/campground/:id/review', isLoggedin, catchAsync(async(req, res) => {
    const campground = await Campground.findById(req.params.id);
    const review = new Review(req.body.review);
    review.author = req.user._id;
    campground.reviews.push(review);
    await review.save();
    await campground.save();
    req.flash('success', 'succesfully posted review');
    res.redirect(`/campground/${req.params.id}`);
}));

app.delete('/campground/:id1/review/:id2', isLoggedin, isReviewAuth, catchAsync(async(req, res) => {
    const { id1, id2 } = req.params;
    await Campground.findByIdAndUpdate(id1, { $pull: { reviews: id2 } });
    await Review.findByIdAndDelete(id2);
    req.flash('success', 'successfully deleted your review');
    res.redirect(`/campground/${id1}`);
}));


app.delete('/campground/:id', isLoggedin, isAuthor, catchAsync(async(req, res) => {
    const { id } = req.params;
    const campground = await Campground.findById(id);
    for (let reviewId of campground.reviews) {
        await Review.findByIdAndDelete(reviewId);
    }
    await Campground.findByIdAndDelete(id);
    req.flash('success', 'successfully deleted campground');
    res.redirect('/campground');
}));

app.get('/campground/:id/edit', isLoggedin, isAuthor, catchAsync(async(req, res) => {
    const campground = await Campground.findById(req.params.id);
    if (!campground) {
        req.flash('error', 'Campground not found');
        return res.redirect('/campground');
    }
    res.render('campground/edit', { campground });
}));

app.put('/campground/:id', isLoggedin, isAuthor, upload.array('image'), validateCamp, catchAsync(async(req, res) => {
    const { id } = req.params;
    const campground = await Campground.findByIdAndUpdate(id, {...req.body.campground });
    const images = req.files.map(f => ({ url: f.path, filename: f.filename }));
    campground.images.push(...images);
    await campground.save();
    if (req.body.deleteImages) {
        for (let filename of req.body.deleteImages) {
            await cloudinary.uploader.destroy(filename);
        }
        await campground.updateOne({ $pull: { images: { filename: { $in: req.body.deleteImages } } } });
    }
    req.flash('success', 'Successfully updated campground');
    res.redirect(`/campground/${campground._id}`);
}));


app.get('/campground/:id', catchAsync(async(req, res) => {
    const { id } = req.params;
    const campground = await Campground.findById(id).populate({
        path: 'reviews',
        populate: {
            path: 'author'
        }
    }).populate('author');
    if (!campground) {
        req.flash('error', 'Campground not found');
        return res.redirect('/campground');
    }
    res.render('campground/show', { campground });
}));

app.get('/register', (req, res) => {
    res.render('auth/register');
})
app.post('/register', catchAsync(async(req, res, next) => {
    try {
        const { email, username, password } = req.body;
        const user = new User({ email, username });
        const registeredUser = await User.register(user, password);
        req.login(registeredUser, err => {
            if (err) return next(err);
            req.flash('success', 'Registerd successfully!!!');
            res.redirect('/campground');
        })
    } catch (e) {
        req.flash('error', e.message);
        res.redirect('/register');
    }
}));

app.get('/login', (req, res) => {
    res.render('auth/login');
})

app.post('/login', passport.authenticate('local', { failureFlash: true, failureRedirect: '/login' }), catchAsync(async(req, res) => {
    req.flash('success', 'Successfully logged in');
    const redirectUrl = req.session.redirectTo || '/campground';
    delete req.session.redirectTo;
    res.redirect(redirectUrl);
}));

app.get('/logout', (req, res) => {
    req.logout();
    req.flash('success', 'Logged out successfully');
    res.redirect('/campground');
})

app.all('*', (req, res, next) => {
    next(new ExpressEroor(404, "Not found"));
});

app.use((err, req, res, next) => {
    const { status = 500 } = err;
    if (!err.message) {
        err.message = 'something went wrong';
    }
    res.status(status).render('error', { err });
});

app.listen(3000, () => {
    console.log("listening to port 3000")
})