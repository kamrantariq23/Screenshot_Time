/* eslint-disable func-names */
import express from 'express';
import cors from 'cors';
import status from 'http-status';
import morgan from 'morgan';
import helmet from 'helmet';
import compression from 'compression';
import passport from 'passport';
import dbConnection from './Connection/dbConnect';
import Router from './Routes/Router';
import errorHandler from './Middlewares/errorHandler';
import verifyToken from './Middlewares/verifyToken';

dbConnection();

const app = express();

// initialize passport
app.use(passport.initialize());
app.use(passport.session());

app.use(morgan('dev'));
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(
    express.urlencoded({
        extended: false,
    }),
);

// will decode token from each request in {req.user}
app.use(verifyToken.verifyTokenSetUser);

app.use(express.json());

app.get('/', (req, res) => {
    res.status(status.OK).send({ Message: 'Connected', status: status.OK });
});

app.use('/api/v1/signup', Router.SignupRouter);

app.use('/api/v1/signin', Router.SigninRouter);

app.use('/api/v1/event', Router.EventRouter);

app.use('/api/v1/superAdmin', Router.SuperAdmin);

app.use('/api/v1/timetrack', Router.TimeTracking);

app.use('/api/v1/userGroup', Router.UserGroup);

app.use('/api/v1/owner', Router.OwnerRoute);

app.use('/api/v1/manager', Router.Manager);

app.use('/api/v1/SystemAdmin', Router.SystemAdmin);

// i have implemented it in signup controller like this {next(new Error('Image is required'))}
app.use(errorHandler);

const port = process.env.PORT || 5000;

app.listen(port, () =>
    console.log(`App listening On port http://localhost:${port}`),
);