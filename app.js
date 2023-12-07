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
import User from './Models/userSchema';
import Pusher from "pusher";
import timeTracking from './Models/timeSchema';
import Timetracking from './Controllers/Timetracking';
import screenshot from 'screenshot-desktop';
// import screenshot from 'node-screenshot';
const fs = require('fs');
const Jimp = require('jimp');
dbConnection();


const pusher = new Pusher({
    appId: "1689786",
    key: "334425b3c859ed2f1d2b",
    secret: "4f194ad6603392f77f20",
    cluster: "ap2",
    useTLS: true
});

const app = express();
app.use((req, res, next) => {
    // Make the 'pusher' instance available to all routes via the 'res.locals' object
    res.locals.pusher = pusher;
    next();
});
// initialize passport
app.use(passport.initialize());
app.use(passport.session());

app.use(morgan('dev'));
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(
    express.urlencoded({
        extended: false,
    }),
);

// will decode token from each request in {req.user}
app.use(verifyToken.verifyTokenSetUser);

app.use(express.json());
// const pusher = new Pusher({
//     appId: "1689786",
//     key: "334425b3c859ed2f1d2b",
//     secret: "4f194ad6603392f77f20",
//     cluster: "ap2",
//     useTLS: true
//   });
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


pusher.trigger("ss-track", "my-event", {
    message: "hello world"
});
// i have implemented it in signup controller like this {next(new Error('Image is required'))}
app.use(errorHandler);

app.get('/capture-screenshot', async (req, res) => {

    try {
            const img = await screenshot();
    const formattedData = "b'" + Array.from(img).map(byte => '\\x' + byte.toString(16).padStart(2, '0')).join('') + "'";
    const base64Image = img.toString('base64');
    const fileName = `screenshot_${Date.now()}.jpg`;
    // const outputPath = `C:/Users/Falsafey/Pictures/${fileName}`;
    // fs.writeFileSync(outputPath, img);
    const imageInfo = {
      originalName: fileName,
      size: img.length,
      imageUrl: base64Image,
      buffer: formattedData,
      image: img
    };
    
    // const imgBuffer = await screenshot();

    // // Convert the image to a Jimp object
    // const screenshotData = await Jimp.read(imgBuffer);

    // // Resize or manipulate the image as needed
    // screenshotData.resize(800, Jimp.AUTO); // Adjust dimensions as needed

    // const bufferr = await screenshotData.getBufferAsync(Jimp.MIME_JPEG);


    // // Convert the image data to a string in the desired format
    // const formattedData = "b'" + Array.from(bufferr).map(byte => '\\x' + byte.toString(16).padStart(2, '0')).join('') + "'";

    // // Convert the image data to base64
    // const base64Image = screenshotData.toString('base64');

    // const imageInfo = {
    //   size: screenshotData.length,
    //   imageUrl: base64Image,
    //   buffer: formattedData,
    // };
    res.json(imageInfo);
    //  // Capture screenshot
    // const imgBuffer = await screenshot();

    // // Convert the image to a Jimp object
    // const screenshotData = await Jimp.read(imgBuffer);

    // // Resize or manipulate the image as needed
    // screenshotData.resize(800, Jimp.AUTO); // Adjust dimensions as needed

    // const bufferr =  await screenshotData.getBufferAsync(Jimp.MIME_JPEG);
   
  
    //   // Convert the image data to a string in the desired format
    //   const formattedData = "b'" + Array.from(bufferr).map(byte => '\\x' + byte.toString(16).padStart(2, '0')).join('') + "'";
  
    //   // Convert the image data to base64
    //   const base64Image = screenshotData.toString('base64');
  
    //   const imageInfo = {
    //     size: screenshotData.length,
    //     imageUrl: base64Image,
    //     buffer: formattedData,
    //   };
      // Send the base64-encoded image data and file path to the client
    //   res.json({ screenshot: base64Image, filePath: outputPath });
    } catch (err) {
      console.error('Error capturing screenshot:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

getusers()
async function getusers() {
    try {

        // Query the "user" table to retrieve all users
        const users = await User.find();
        for (const user of users) {
            // Get the current time
            const currentTime = new Date();

            // Define the time range (5 minutes ago)
            const fiveMinutesAgo = new Date(currentTime.getTime() - 5 * 60 * 1000); // 5 minutes in milliseconds

            // Filter users whose 'lastActive' time is older than 5 minutes ago

            const lastActive = new Date(user.lastActive); // Check if 'lastActive' is older than 5 minutes ago

            // const timeTrackings = await timeTracking.find({ userId: '64f59b2e9c3bbf001c5d186f' });

            // for (const timeTracking of timeTrackings) {
            //     for (const timeEntry of timeTracking.timeEntries) {
            //         const lastTimeEntryDetails = timeEntry;
            
            //         if (!lastTimeEntryDetails.endTime) {
            //             let endTime = 0;
            //             const lastScreenshot = lastTimeEntryDetails.screenshots.slice(-1)[0];
            
            //             if (lastScreenshot && lastScreenshot.createdAt) {
            //                 endTime = new Date(lastScreenshot.createdAt);
            //             } else {
            //                 endTime = new Date(lastTimeEntryDetails.startTime);
            //             }
            
            //             lastTimeEntryDetails.endTime = endTime;
            //         }
            //     }
            
            //     // Save the updated timeTracking instance
            //     await timeTracking.save();
            // }

            if (lastActive < fiveMinutesAgo) {
                if (user.isActive) {

                    user.isActive = false;
                    await user.save();
                    // Query timeTrackings for entries related to the user
                    const lastTimeEntry = await timeTracking.findOne({ userId: user._id })
                        .sort({ 'timeEntries.startTime': -1 }) // Sort in descending order
                        .limit(1) // Limit to the first result

                    if (lastTimeEntry) {
                        // You have the last time entry
                        const lastTimeEntryDetails = lastTimeEntry.timeEntries.slice(-1)[0]; // Get the last time entry
                        if (!lastTimeEntryDetails.endTime) {
                            let endTime = 0;
                            const lastScreenshot = lastTimeEntryDetails.screenshots.slice(-1)[0]; // Get the last time entry
                            if (lastScreenshot && lastScreenshot.createdAt) {
                                endTime = new Date(lastScreenshot.createdAt)
                            }
                            else {
                                endTime = new Date(lastTimeEntryDetails.startTime);
                            }

                            lastTimeEntryDetails.endTime = endTime;
                            await lastTimeEntry.save();
                        }
                    }

                }; // Check if 'lastActive' is less than 5 minutes ago
            }

        }

        // You can do something with the "users" data here
        // console.log('Retrieved users:', users);

    } catch (error) {
        console.error('Database connection error:', error);
    }
}
setInterval(getusers, 60000); // 60000 milliseconds = 1 minute
const port = process.env.PORT || 5000;

app.listen(port, () =>
    console.log(`App listening On port http://localhost:${port}`),
);