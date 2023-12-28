/* eslint-disable no-shadow */
/* eslint-disable no-unused-vars */
/* eslint-disable no-plusplus */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-await-in-loop */
// import status from 'http-status';
import { DateTime } from 'luxon';
import UserSchema from '../Models/userSchema';
import TimeTracking from '../Models/timeSchema';
import ScreenshotHistory from '../Models/screenshotHistorySchema';
import ProjectSchema from '../Models/projectSchema';
import EmployeeSettings from '../Models/effectiveSettingSchema';


const getAllUserActiveStatus = async (req, res) => {

    try {
        // Check if the user exists
        const user = await UserSchema.find();
        if (!user) {
            return res.status(404).json({ success: false, message: 'Users not found' });
        }

        // Check if the user has been inactive for more than 5 minutes
        const lastActiveTime = user.lastActive.getTime();
        const currentTime = new Date().getTime();
        const timeDiff = currentTime - lastActiveTime;
        const inactiveThreshold = 5 * 60 * 1000; // 5 minutes in milliseconds
        const isActive = user.isActive;

        return res.status(200).json({ success: true, data: { isActive } });
    } catch (error) {
        console.error('Error getting user active status:', error);
        return res.status(500).json({ success: false, message: 'Failed to get user active status' });
    }
};

const getManagedUsers = async (req, res) => {
    try {
        const { managerId } = req.params;

        // Find the manager
        const manager = await UserSchema.findById(managerId);
        if (!manager) {
            return res.status(404).json({ message: 'Manager not found' });
        }

        // Find the users managed by this manager
        const users = await UserSchema.find({ managerId }).populate('projectId', '_id name');

        if (!users) {
            return res.status(404).json({ message: 'No managed users found' });
        }

        const usersWithProjects = users.map(user => {
            return {
                _id: user._id,
                name: user.name,
                email: user.email,
                projectId: user.projectId.map(project => ({
                    _id: project._id,
                    name: project.name,
                    // Add any other project fields you want to include
                })),
            };
        });

        return res.status(200).json({ usersWithProjects });

    } catch (error) {
        console.error('Error getting managed users:', error);
        return res.status(500).json({ message: 'Failed to get managed users' });
    }
};

function formatTimeFrame(startTime, endTime) {
    const formatHoursAndMinutes = (date) => {
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const amOrPm = hours < 12 ? 'A.M' : 'P.M';
        const adjustedHours = hours % 12 || 12;
        return `${String(adjustedHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${amOrPm}`;
    };

    return `${formatHoursAndMinutes(startTime)} - ${formatHoursAndMinutes(endTime)}`;
}

function groupScreenshotsByTimeSlots(screenshots, timeSlotDurationInMinutes) {
    const groupedScreenshots = [];

    // Sort the screenshots by their creation time
    const sortedScreenshots = screenshots.sort((a, b) => a.createdAt - b.createdAt);

    let currentStartTime = null;
    let currentEndTime = null;
    let currentTimeSlotScreenshots = [];

    sortedScreenshots.forEach((screenshot) => {
        if (!currentStartTime || !currentEndTime) {
            currentStartTime = screenshot.createdAt;
            currentEndTime = new Date(currentStartTime.getTime() + (timeSlotDurationInMinutes * 60 * 1000));
            currentTimeSlotScreenshots.push(screenshot);
        } else if (screenshot.createdAt >= currentStartTime && screenshot.createdAt < currentEndTime) {
            currentTimeSlotScreenshots.push(screenshot);
        } else {
            const timeFrame = formatTimeFrame(currentStartTime, currentEndTime);
            groupedScreenshots.push({ time: timeFrame, screenshots: currentTimeSlotScreenshots });

            currentStartTime = screenshot.createdAt;
            currentEndTime = new Date(currentStartTime.getTime() + (timeSlotDurationInMinutes * 60 * 1000));
            currentTimeSlotScreenshots = [screenshot];
        }
    });

    // Add the last time slot if there are any remaining screenshots
    if (currentTimeSlotScreenshots.length > 0) {
        const timeFrame = formatTimeFrame(currentStartTime, currentEndTime);
        groupedScreenshots.push({ time: timeFrame, screenshots: currentTimeSlotScreenshots });
    }

    return groupedScreenshots;
}

const formatTime = (time) => {
    const hours = Math.floor(time);
    const minutes = Math.floor((time - hours) * 60);
    if (minutes === 60) {
        // If minutes are 60, increment the hour and set minutes to 0
        return `${hours + 1}h 0m`;
    } else {
        return `${hours}h ${minutes}m`;
    }
};

const getManagerHoursWorked = async (req, res) => {
    const { userId } = req.params;
    const date = req.query.date ? new Date(req.query.date) : new Date();

    const converttimezone = (time, timezone) => {

        const originalTime = DateTime.fromJSDate(time);
        const convertedTime = originalTime.setZone(timezone);
        return convertedTime;
    };

    try {
        const user = await UserSchema.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const ratePerHour = user.billingInfo ? user.billingInfo.ratePerHour : 0;
        const { DateTime } = require('luxon');

        // Convert user input to the application's standard time zone
        const userDateTime = setHoursDifference(date, req.user.timezoneOffset, req.user.timezone)

        // Perform calculations in the standard time zone
        const startOfToday = userDateTime.startOf('day');
        const endOfToday = userDateTime.endOf('day');
        const startOfThisWeek = userDateTime.startOf('week');
        const startOfThisMonth = userDateTime.startOf('month');

        // Format and display the results in the user's preferred time zone
        const startOfTodayFormatted = startOfToday.setZone(req.user.timezone).toLocaleString();
        const endOfTodayFormatted = endOfToday.setZone(req.user.timezone).toLocaleString();
        // Calculate endOfThisWeek
        const endOfThisWeek = userDateTime.endOf('week');

        // Calculate endOfThisMonth
        const endOfThisMonth = userDateTime.endOf('month');
        // ...and so on for other calculations

        const timeTrackings = await TimeTracking.find({ userId });
        const activityData = {
            daily: { visitedUrls: [] },
            weekly: { visitedUrls: [] },
            monthly: { visitedUrls: [] },
        };
        const totalHoursWorked = {
            daily: 0,
            weekly: 0,
            monthly: 0,
            offline: 0,
        };
        let activityCount = 0;
        let totalActivity = 0;
        let newHoursWorked = 0;
        let TimeTrackingId = 0;
        let hoursWorked = 0;
        const groupedScreenshots = [];
        var newTimeEntry = [];

        // const now = new Date();
        const now = user.lastActive; // Current time for handling ongoing time entries

        for (const timeTracking of timeTrackings) {
            for (const timeEntry of timeTracking.timeEntries) {
                TimeTrackingId = timeTracking._id;
                let startTime = DateTime.fromJSDate(timeEntry.startTime, { zone: req.user.timezone });
                let endTime = 0;
                if (timeEntry.endTime) {
                    endTime = DateTime.fromJSDate(timeEntry.endTime, { zone: req.user.timezone });
                } else {
                    const lastScreenshot = timeEntry.screenshots.slice(-1)[0];

                    if (lastScreenshot) {
                        endTime = DateTime.fromJSDate(lastScreenshot.createdAt, { zone: req.user.timezone });
                    } else {
                        // No screenshots in this timeEntry, skip it
                        continue;
                    }
                }
                if (startTime == endTime) {
                    continue;
                }
                let screenshotTimeRange = 0

                if (startTime >= startOfToday && startTime < endOfToday && endTime > endOfToday) {
                    // Create a new time entry for the next day starting at 12:00 AM
                    newTimeEntry = { ...timeEntry };
                    newTimeEntry.startTime = endTime.startOf('day');

                    newTimeEntry.endTime = new Date(endTime);

                    // Modify the endTime of the original time entry to be 11:59:59.999 PM of the current day
                    timeEntry.endTime = startTime.endOf('day');
                    endTime = DateTime.fromJSDate(timeEntry.endTime, { zone: req.user.timezone });

                    // Calculate the hours worked for both time entries
                    hoursWorked = (endTime - startTime) / (1000 * 60 * 60);
                    newHoursWorked = (newTimeEntry.endTime - newTimeEntry.startTime) / (1000 * 60 * 60);

                    // Add hours worked to the appropriate time range (daily, weekly, monthly)
                    if (startTime >= startOfToday && startTime < endOfToday) {
                        totalHoursWorked.daily += hoursWorked;

                    }
                    if (newTimeEntry.startTime >= startOfToday && newTimeEntry.startTime < endOfToday) {
                        totalHoursWorked.daily += newHoursWorked;
                    }
                } else if (startTime < startOfToday && endTime >= startOfToday && endTime < endOfToday) {
                    newTimeEntry = { ...timeEntry };
                    newTimeEntry.startTime = new Date(startTime);
                    newTimeEntry.endTime = startTime.endOf('day');

                    // Modify the endTime of the original time entry to be 11:59:59.999 PM of the current day

                    timeEntry.startTime = endTime.startOf('day');
                    startTime = DateTime.fromJSDate(timeEntry.startTime, { zone: req.user.timezone });
                    // Calculate the hours worked for both time entries
                    hoursWorked = (endTime - startTime) / (1000 * 60 * 60);

                    newHoursWorked = (newTimeEntry.endTime - newTimeEntry.startTime) / (1000 * 60 * 60);

                    // Add hours worked to the appropriate time range (daily, weekly, monthly)
                    if (newTimeEntry.startTime >= startOfToday && newTimeEntry.startTime < endOfToday) {
                        totalHoursWorked.daily += newHoursWorked;
                    }
                    // Add hours worked to the appropriate time range (daily, weekly, monthly)
                    if (startTime >= startOfToday && startTime < endOfToday) {
                        totalHoursWorked.daily += hoursWorked;
                    }

                } else {
                    // Calculate the hours worked using the corrected start and end times
                    hoursWorked = (endTime - startTime) / (1000 * 60 * 60);
                    newHoursWorked = 0;
                    // Add hours worked to the appropriate time range (daily, weekly, monthly)
                    if (startTime >= startOfToday && startTime < endOfToday) {
                        totalHoursWorked.daily += hoursWorked;
                    }
                }

                if (newTimeEntry.startTime >= startOfToday && newTimeEntry.startTime < endOfToday) {
                    const screenshotStartTime = startTime.toFormat('h:mm a');
                    const screenshotEndTime = endTime.toFormat('h:mm a');

                    if (timeEntry.description == 'offline') {
                        screenshotTimeRange = `${screenshotStartTime} - ${screenshotEndTime} (${timeEntry.description})`;
                        console.log('Range', screenshotTimeRange);
                        groupedScreenshots.push({
                            time: screenshotTimeRange,
                            description: 'This is manually added offline time',
                            timeentryId: timeEntry._id,
                        })
                    }

                }
                else if (startTime >= startOfToday && startTime < endOfToday) {
                    const screenshotStartTime = startTime.toFormat('h:mm a');
                    const screenshotEndTime = endTime.toFormat('h:mm a');

                    if (timeEntry.description == 'offline') {
                        screenshotTimeRange = `${screenshotStartTime} - ${screenshotEndTime} (${timeEntry.description})`;
                        console.log('Range', screenshotTimeRange);
                        groupedScreenshots.push({
                            time: screenshotTimeRange,
                            description: 'This is manually added offline time',
                            timeentryId: timeEntry._id,
                        })
                    }

                }

                // Check if the time entry has screenshots taken today
                if (timeEntry.screenshots && timeEntry.screenshots.length > 0) {
                    console.log('Screenshots are available for processing.');
                    const screenshotsToday = timeEntry.screenshots.filter((screenshot) => {
                        const screenshotTime = converttimezone(screenshot.createdAt, req.user.timezone);

                        return screenshotTime >= startOfToday && screenshotTime < endOfToday;
                    });

                    console.log('Screenshots Today:', screenshotsToday); // Log the screenshots for debugging
                    console.log('visitedUrl', timeEntry.visitedUrls);

                    if (screenshotsToday.length > 0) {
                        console.log('Length of screenshotsToday:', screenshotsToday.length);

                        const screenshotStartTime = startTime.toFormat('h:mm a');
                        const screenshotEndTime = endTime.toFormat('h:mm a');

                        screenshotTimeRange = `${screenshotStartTime} - ${screenshotEndTime}`;
                        console.log('Range', screenshotTimeRange);

                        // Map screenshots to screenshotDetails
                        const screenshotDetails = screenshotsToday.map((screenshot) => {
                            // console.log('Processing screenshot:', screenshot); // Log each screenshot for debugging
                            const convertedCreatedAt = converttimezone(screenshot.createdAt, req.user.timezone);

                            // Calculate the total activity for this screenshot
                            if (screenshot.visitedUrls && screenshot.visitedUrls.length > 0) {
                                totalActivity += screenshot.visitedUrls[0].activityPercentage || 0;
                                activityCount += 1;
                            }

                            return {
                                _id: screenshot._id,
                                key: screenshot.key,
                                description: screenshot.description,
                                time: convertedCreatedAt.toFormat('h:mm a'),
                                visitedUrls: screenshot.visitedUrls,
                                activities: timeEntry.activities,
                            };
                        });
                        let totalcount = 0;
                        const totalActivityForScreenshots = screenshotDetails.reduce((total, screenshot) => {
                            // Check if visitedUrls and activityPercentage are defined
                            if (screenshot.visitedUrls && screenshot.visitedUrls[0] && screenshot.visitedUrls[0].activityPercentage !== undefined) {
                                return total + screenshot.visitedUrls[0].activityPercentage;
                            }
                            return total;
                        }, 0);

                        const maxPossibleActivity = 100 * screenshotDetails.length; // Assuming each screenshot can have a maximum activity of 100%

                        const totalActivityAsPercentage = totalActivityForScreenshots / screenshotDetails.length;

                        // Push screenshot data to groupedScreenshots along with totalactivity as a percentage
                        groupedScreenshots.push(
                            {
                                time: screenshotTimeRange,
                                screenshots: screenshotDetails,
                                totalactivity: totalActivityAsPercentage,
                                timeentryId: timeEntry._id,
                            }
                        );
                    }
                }

                if (startTime >= startOfThisWeek && startTime < endOfThisWeek) {
                    totalHoursWorked.weekly += hoursWorked;
                }
                if (newTimeEntry.startTime >= startOfThisWeek && newTimeEntry.startTime < endOfThisWeek) {
                    totalHoursWorked.weekly += newHoursWorked;
                }

                if (startTime >= startOfThisMonth && startTime < endOfThisMonth) {
                    totalHoursWorked.monthly += hoursWorked;
                }
                if (newTimeEntry.startTime >= startOfThisMonth && newTimeEntry.startTime < endOfThisMonth) {
                    totalHoursWorked.monthly += newHoursWorked;
                }
            }
        }

        totalHoursWorked.daily = Math.max(totalHoursWorked.daily, 0);
        totalHoursWorked.weekly = Math.max(totalHoursWorked.weekly, 0);
        totalHoursWorked.monthly = Math.max(totalHoursWorked.monthly, 0);

        const formattedTotalHoursWorked = {
            daily: formatTime(totalHoursWorked.daily),
            weekly: formatTime(totalHoursWorked.weekly),
            monthly: formatTime(totalHoursWorked.monthly),
        };

        const totalActivityToday = activityCount > 0 ? (totalActivity / activityCount) : 0;
        console.log('Total Activity Today:', totalActivityToday + '%');

        return res.status(200).json({
            success: true,
            data: {
                totalHours: formattedTotalHoursWorked,
                billingAmounts: {
                    daily: Math.round(totalHoursWorked.daily * ratePerHour),
                    weekly: Math.round(totalHoursWorked.weekly * ratePerHour),
                    monthly: Math.round(totalHoursWorked.monthly * ratePerHour),
                },
                groupedScreenshots,
                totalactivity: totalActivityToday,
                timezone: user.timezone,
                name: user.name,
                email: user.email,
                usertype: user.userType,
                startOfToday: startOfToday,
                endOfToday: endOfToday,
                startOfThisWeek: startOfThisWeek,
                TimeTrackingId: TimeTrackingId,
            },
        });
    } catch (error) {
        console.error('Error getting total hours and screenshots:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const getActivityData = async (req, res) => {
    const { eid } = req.params;
    const managerId = req.user._id; // Assuming req.user is the authenticated user from your middleware

    try {
        // Check if the user exists and is assigned to the manager
        const user = await UserSchema.findOne({ _id: eid, managerId });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found or not assigned to you' });
        }

        // Get the start and end times for the current day, week, and month
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);
        const startOfThisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
        const endOfThisWeek = new Date(startOfThisWeek);
        endOfThisWeek.setDate(startOfThisWeek.getDate() + 7); // 6 days added to the start of the week

        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfThisMonth = new Date(startOfThisMonth);
        endOfThisMonth.setMonth(startOfThisMonth.getMonth() + 1); // 1 month added to the start of the month
        // 0 day of the next month, which gives the last day of the current month

        // Get the timeTrackings
        const timeTrackings = await TimeTracking.find({ eid }).populate(' timeEntries.visitedUrls');

        const activityData = {
            daily: { visitedUrls: [] },
            weekly: { visitedUrls: [] },
            monthly: { visitedUrls: [] },
            yesterday: { visitedUrls: [] },
        };

        for (const timeTracking of timeTrackings) {
            for (const timeEntry of timeTracking.timeEntries) {
                const startTime = new Date(timeEntry.startTime);

                if (startTime >= startOfToday) {
                    activityData.daily.screenshots.push(...timeEntry.screenshots);
                    activityData.daily.visitedUrls.push(...timeEntry.visitedUrls);
                }

                if (startTime >= startOfThisWeek && startTime < endOfThisWeek) {
                    activityData.weekly.screenshots.push(...timeEntry.screenshots);
                    activityData.weekly.visitedUrls.push(...timeEntry.visitedUrls);
                }

                if (startTime >= startOfThisMonth && startTime < endOfThisMonth) {
                    activityData.monthly.screenshots.push(...timeEntry.screenshots);
                    activityData.monthly.visitedUrls.push(...timeEntry.visitedUrls);
                }

                if (startTime >= startOfYesterday && startTime < startOfToday) {
                    activityData.yesterday.screenshots.push(...timeEntry.screenshots);
                    activityData.yesterday.visitedUrls.push(...timeEntry.visitedUrls);
                }
            }
        }

        return res.status(200).json({ success: true, data: activityData });
    } catch (error) {
        console.error('Error getting activity data:', error);
        return res.status(500).json({ success: false, message: 'Failed to get activity data' });
    }
};

const getMinutesAgo = (lastActiveTime) => {
    const currentTime = new Date();
    const timeDiffInMs = currentTime.getTime() - lastActiveTime.getTime();
    const minutesAgo = Math.floor(timeDiffInMs / (1000 * 60));

    // Formatting the result
    return minutesAgo > 1 ? `${minutesAgo} minutes ago` : `${minutesAgo} minute ago`;
};

function formatHoursAndMinutes(time) {
    let hours = time.hours || 0;
    let minutes = time.minutes || 0;

    hours = String(hours).padStart(2, '0');
    minutes = String(minutes).padStart(2, '0');

    return `${hours}h ${minutes}m`;
}

const setHoursDifference = (starttToday, timezoneOffset, timezone) => {
    // var startOToday = '2023-10-20T00:00:00.000Z'
    var currentOffset = starttToday.getTimezoneOffset();
    var targetTimezoneOffset = timezoneOffset * 60;
    var timezoneDifference = targetTimezoneOffset + currentOffset;
    starttToday.setMinutes(starttToday.getMinutes() - timezoneDifference);
    const originalTime = DateTime.fromJSDate(starttToday);
    const convertedTime = originalTime.setZone(timezone);
    //  // Log the original and converted times
    return convertedTime;
}

const calculateHoursWorked = async (user, period) => {
    const now = new Date();
    const userDateTime = setHoursDifference(now, user.ownertimezoneOffset, user.ownertimezone)
    let totalhours = 0;
    let hoursWorked = 0;
    let newHoursWorked = 0;
    let newTimeEntry = []
    // Perform calculations in the standard time zone
    const startOfToday = userDateTime.startOf('day');
    const endOfToday = userDateTime.endOf('day');
    const startOfThisWeek = userDateTime.startOf('week');
    const startOfThisMonth = userDateTime.startOf('month');

    const startOfYesterday = userDateTime.minus({ days: 1 }).startOf('day'); // Subtract 1 day for yesterday
    const endOfYesterday = startOfYesterday.endOf('day'); // Start of today is the end of yesterday
    // Calculate endOfThisWeek
    const endOfThisWeek = userDateTime.endOf('week');

    // Calculate endOfThisMonth
    const endOfThisMonth = userDateTime.endOf('month');

    const periods = {
        daily: {
            start: userDateTime.startOf('day'),
            end: userDateTime.endOf('day'),
        },
        yesterday: {
            start: userDateTime.minus({ days: 1 }).startOf('day'), // Subtract 1 day for yesterday,
            end: startOfYesterday.endOf('day'), // Start of today is the end of yesterday
        },
        weekly: {
            start: userDateTime.startOf('week'),
            end: userDateTime.endOf('week'),
        },
        monthly: {
            start: userDateTime.startOf('month'),
            end: userDateTime.endOf('month'),
        },
    };

    const timeEntries = await TimeTracking.aggregate([
        { $match: { userId: user._id } },
        { $unwind: '$timeEntries' },
        {
            $match: {
                $or: [
                    // Condition 1
                    {
                        'timeEntries.startTime': { $gte: periods[period].start, $lt: periods[period].end },
                        'timeEntries.endTime': { $gt: periods[period].end }
                    },
                    // Condition 2
                    {
                        'timeEntries.startTime': { $lt: periods[period].start },
                        'timeEntries.endTime': { $gte: periods[period].start, $lt: periods[period].end }
                    },
                    // Condition 3 (Within the current month)
                    {
                        'timeEntries.startTime': { $gte: periods[period].start, $lt: periods[period].end },
                        'timeEntries.endTime': { $gte: periods[period].start, $lt: periods[period].end }
                    },
                ],
            },
        },
    ]);
    
    // const timeEntries = await TimeTracking.aggregate([
    //     { $match: { userId: user._id } },
    //     { $unwind: '$timeEntries' },
    //     {
    //         $match: {
    //             $or: [
    //                 // Time entries that start and end within the selected period
    //                 {
    //                     'timeEntries.startTime': { $gte: periods[period].start, $lt: periods[period].end },
    //                 },
    //                 // Time entries that started before the selected period and extend into it
    //                 {
    //                     'timeEntries.startTime': { $lt: periods[period].start },
    //                     'timeEntries.endTime': { $gte: periods[period].start },
    //                 },
    //                 // Time entries that start from yesterday and end on today
    //                 {
    //                     'timeEntries.startTime': { $lt: periods[period].end },
    //                     'timeEntries.endTime': { $gte: periods[period].end },
    //                 },
    //             ],
    //         },
    //     },
    // ]);

    const totalMilliseconds = timeEntries.reduce((acc, entry) => {
        if (entry.timeEntries.startTime) {
            let startTime = DateTime.fromJSDate(entry.timeEntries.startTime, { zone: user.ownertimezone });
            let endTime = 0;
            if (entry.timeEntries.endTime) {
                endTime = DateTime.fromJSDate(entry.timeEntries.endTime, { zone: user.ownertimezone });
            } else {
                const lastScreenshot = entry.timeEntries.screenshots.slice(-1)[0];

                if (lastScreenshot) {
                    endTime = DateTime.fromJSDate(lastScreenshot.createdAt, { zone: user.ownertimezone });
                }
                else {
                    endTime = startTime;
                }
            }
            if (startTime >= periods[period].start && startTime < periods[period].end && endTime > periods[period].end) {
                // Create a new time entry for the next day starting at 12:00 AM
                newTimeEntry = { ...entry.timeEntries };
                newTimeEntry.startTime = endTime.startOf('day');

                newTimeEntry.endTime = new Date(endTime);

                // Modify the endTime of the original time entry to be 11:59:59.999 PM of the current day
                entry.timeEntries.endTime = startTime.endOf('day');
                endTime = entry.timeEntries.endTime;

                // Calculate the hours worked for both time entries
                hoursWorked = (endTime - startTime);
                newHoursWorked = (newTimeEntry.endTime - newTimeEntry.startTime);

                // Add hours worked to the appropriate time range (daily, weekly, monthly)

            } else if (startTime < periods[period].start && endTime >= periods[period].start && endTime < periods[period].end) {
                newTimeEntry = { ...entry.timeEntries };
                newTimeEntry.startTime = new Date(startTime);
                newTimeEntry.endTime = startTime.endOf('day');

                // Modify the endTime of the original time entry to be 11:59:59.999 PM of the current day

                entry.timeEntries.startTime = endTime.startOf('day');
                startTime = entry.timeEntries.startTime;
                // Calculate the hours worked for both time entries
                hoursWorked = (endTime - startTime);
                //  (endTime - entry.timeEntries.startTime);

                newHoursWorked = (newTimeEntry.endTime - newTimeEntry.startTime);

            } else {
                // Calculate the hours worked using the corrected start and end times
                hoursWorked = (endTime - startTime);
                newHoursWorked = 0;
            }
            if (startTime >= periods[period].start && startTime < periods[period].end) {
                totalhours += hoursWorked;

            }
            if (newTimeEntry.startTime >= periods[period].start && newTimeEntry.startTime < periods[period].end) {
                totalhours += newHoursWorked;
            }
            return acc = totalhours;
        }
        return acc;
    }, 0);

    const totalHours = Math.floor(totalMilliseconds / (1000 * 60 * 60));
    const totalMinutes = Math.floor((totalMilliseconds % (1000 * 60 * 60)) / (1000 * 60));

    return { hours: totalHours, minutes: totalMinutes };
};

const getTimeAgo = (lastActiveTime) => {
    const currentTime = new Date();
    const timeDiffInMs = currentTime.getTime() - lastActiveTime.getTime();
    const minutesAgo = Math.floor(timeDiffInMs / (1000 * 60));
    const hoursAgo = Math.floor(timeDiffInMs / (1000 * 60 * 60));
    const daysAgo = Math.floor(timeDiffInMs / (1000 * 60 * 60 * 24));

    if (minutesAgo < 60) {
        return minutesAgo > 1 ? `${minutesAgo} minutes ago` : `${minutesAgo} minute ago`;
    } if (hoursAgo < 24) {
        return hoursAgo > 1 ? `${hoursAgo} hours ago` : `${hoursAgo} hour ago`;
    }
    return daysAgo > 1 ? `${daysAgo} days ago` : `${daysAgo} day ago`;
};

const calculateBillingAmount = async (user, period) => {
    const ratePerHour = user.billingInfo ? user.billingInfo.ratePerHour : 0;
    const totalHoursWorked = await calculateHoursWorked(user, period);
    const totalBillingAmount = (totalHoursWorked.hours + totalHoursWorked.minutes / 60) * ratePerHour;
    return Math.round(totalBillingAmount);
};

async function retrieveScreenshotsForUser(userId) {
    try {
        const user = await UserSchema.findById(userId);
        let latestScreenshot = null;
        // Find all time entries for the user
        const timeEntries = await TimeTracking.aggregate([
            { $match: { userId } },
            { $unwind: '$timeEntries' },
            { $sort: { 'timeEntries.startTime': -1 } }, // Sort by start time in descending order
            { $limit: 5 } // Retrieve the two most recent time entries
        ]);

        if (!timeEntries || timeEntries.length === 0) {
            return null; // No time entries found for the user
        }

        for (const timeEntry of timeEntries) {
            if (timeEntry.timeEntries.screenshots && timeEntry.timeEntries.screenshots.length > 0) {
                // Get the last screenshot from the time entry
                const lastScreenshot = timeEntry.timeEntries.screenshots[timeEntry.timeEntries.screenshots.length - 1];
                latestScreenshot= lastScreenshot ;

                // If the last screenshots are found, return and exit the loop
                return latestScreenshot;
            }
        }

        // If no last screenshots are found, it will reach this point
        return latestScreenshot;
    } catch (error) {
        console.error(error);
        return null; // Return null in case of any error
    }
}

const MangerDashboard = async (req, res) => {
    try {
        const users = await UserSchema.find({ company: req.user.company, managerId: req.user._id });
          
        const totalHoursAll = {
            daily: { hours: 0, minutes: 0 },
            yesterday: { hours: 0, minutes: 0 },
            weekly: { hours: 0, minutes: 0 },
            monthly: { hours: 0, minutes: 0 },
        };

        const totalBillingAll = {
            daily: 0,
            yesterday: 0,
            weekly: 0,
            monthly: 0,
        };

        let totalUsers = 0;
        let totalUsersWorkingToday = 0;
        const offlineUsers = [];

        const usersWorkingToday = await Promise.all(
            users.map(async (user) => {
                user.ownertimezoneOffset = req.user.timezoneOffset
                user.ownertimezone = req.user.timezone
                const employeeId = user._id;

                totalUsers++;

                const totalHoursWorkedDaily = await calculateHoursWorked(user, 'daily');
                const totalHoursWorkedYesterday = await calculateHoursWorked(user, 'yesterday');
                const totalHoursWorkedWeekly = await calculateHoursWorked(user, 'weekly');
                const totalHoursWorkedMonthly = await calculateHoursWorked(user, 'monthly');

                const billingAmountsDaily = await calculateBillingAmount(user, 'daily');
                const billingAmountsYesterday = await calculateBillingAmount(user, 'yesterday');
                const billingAmountsWeekly = await calculateBillingAmount(user, 'weekly');
                const billingAmountsMonthly = await calculateBillingAmount(user, 'monthly');

                totalHoursAll.daily.hours += totalHoursWorkedDaily.hours;
                totalHoursAll.daily.minutes += totalHoursWorkedDaily.minutes;
                totalHoursAll.yesterday.hours += totalHoursWorkedYesterday.hours;
                totalHoursAll.yesterday.minutes += totalHoursWorkedYesterday.minutes;
                totalHoursAll.weekly.hours += totalHoursWorkedWeekly.hours;
                totalHoursAll.weekly.minutes += totalHoursWorkedWeekly.minutes;
                totalHoursAll.monthly.hours += totalHoursWorkedMonthly.hours;
                totalHoursAll.monthly.minutes += totalHoursWorkedMonthly.minutes;

                totalBillingAll.daily += billingAmountsDaily;
                totalBillingAll.yesterday += billingAmountsYesterday;
                totalBillingAll.weekly += billingAmountsWeekly;
                totalBillingAll.monthly += billingAmountsMonthly;

                const recentScreenshot = await retrieveScreenshotsForUser(employeeId);
                if (recentScreenshot) {
                    console.log('Recent screenshot:', recentScreenshot);
                } else {
                    console.log('No recent screenshot found.');
                }

                let minutesAgo = 'Awaiting'
                // Get the user's last active time
                if(user.lastActive > user.createdAt){
                    const lastActiveTime = user.lastActive;
                    minutesAgo = getTimeAgo(lastActiveTime);
                }

                const currentTime = new Date().getTime();
                const inactiveThreshold = 5 * 60 * 1000; // 5 minutes in milliseconds
                const isActive = user.isActive;

                const userInfo = {
                    userId: user._id,
                    userName: user.name,
                    recentScreenshot,
                    minutesAgo,
                    isActive,
                    totalHours: {
                        daily: formatHoursAndMinutes(totalHoursWorkedDaily),
                        yesterday: formatHoursAndMinutes(totalHoursWorkedYesterday),
                        weekly: formatHoursAndMinutes(totalHoursWorkedWeekly),
                        monthly: formatHoursAndMinutes(totalHoursWorkedMonthly),
                    },
                    billingAmounts: {
                        daily: billingAmountsDaily,
                        yesterday: billingAmountsYesterday,
                        weekly: billingAmountsWeekly,
                        monthly: billingAmountsMonthly,
                    },
                };

                if (totalHoursWorkedDaily.hours > 0 || totalHoursWorkedDaily.minutes > 0) {
                    totalUsersWorkingToday++;
                    return userInfo;
                }

                offlineUsers.push(userInfo);
                return null;
            })
        );

        const filteredUsers = usersWorkingToday.filter(user => user !== null);
        const formatHoursAndMinutest = (hours, minutes) => {
            return `${hours < 10 ? '0' : ''}${hours}h ${minutes < 10 ? '0' : ''}${minutes}m`;
        };

        const totalHoursFormatted = {
            daily: formatHoursAndMinutest(totalHoursAll.daily.hours, totalHoursAll.daily.minutes),
            yesterday: formatHoursAndMinutest(totalHoursAll.yesterday.hours, totalHoursAll.yesterday.minutes),
            weekly: formatHoursAndMinutest(totalHoursAll.weekly.hours, totalHoursAll.weekly.minutes),
            monthly: formatHoursAndMinutest(totalHoursAll.monthly.hours, totalHoursAll.monthly.minutes),
        };

        return res.json({
            success: true,
            totalUsers,
            onlineUsers: filteredUsers,
            totalActiveUsers: filteredUsers.length,
            totalUsersWorkingToday,
            offlineUsers,
            offlineUsersTotal: offlineUsers.length,
            totalHours: totalHoursFormatted,
            totalBillingAmounts: totalBillingAll,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

const deleteScreenshotAndDeductTime = async (req, res) => {
    try {
        const { screenshotId, timeTrackingId } = req.params;
        const managerId = req.user._id;

        const timeTracking = await TimeTracking.findById(timeTrackingId).populate('userId');

        if (!timeTracking) {
            return res.status(404).json({ success: false, message: 'Time tracking not found' });
        }

        const user = timeTracking.userId;

        if (!user || !user.managerId.equals(managerId)) {
            return res.status(403).json({ success: false, message: 'You do not have permission to delete this screenshot' });
        }

        // Find the time entry containing the screenshot
        const timeEntryIndex = timeTracking.timeEntries.findIndex((entry) => {
            return entry.screenshots.some((screenshot) => screenshot._id.toString() === screenshotId);
        });

        if (timeEntryIndex === -1) {
            return res.status(404).json({ success: false, message: 'Screenshot not found' });
        }

        // Get the time entry
        const timeEntry = timeTracking.timeEntries[timeEntryIndex];

        // Find the screenshot and remove it
        const screenshotIndex = timeEntry.screenshots.findIndex((screenshot) => screenshot._id.toString() === screenshotId);
        if (screenshotIndex === -1) {
            return res.status(404).json({ success: false, message: 'Screenshot not found' });
        }

        const screenshot = timeEntry.screenshots[screenshotIndex];

        // Save the deleted screenshot to the history collection
        const historyScreenshot = new ScreenshotHistory({
            screenshot: screenshot.screenshot,
            type: 'deleted',
            originalTimeTrackingId: timeTracking._id,
            originalTimeEntryId: timeEntry._id,
            userId: timeTracking.userId,
        });
        await historyScreenshot.save();

        // Remove the screenshot from the time entry
        timeEntry.screenshots.splice(screenshotIndex, 1);

        // Deduct 2 minutes (120,000 ms) from the most recent screenshot or the current time if there are no screenshots left
        if (timeEntry.screenshots.length === 0) {
            timeEntry.endTime = new Date(Date.now() - 120000);
        } else {
            const latestScreenshot = timeEntry.screenshots.reduce((a, b) => {
                return new Date(a.createdAt) > new Date(b.createdAt) ? a : b;
            });
            timeEntry.endTime = new Date(new Date(latestScreenshot.createdAt).getTime() - 120000);
        }

        // Save the updated time tracking document
        await timeTracking.save();

        return res.status(200).json({ success: true, message: 'Screenshot deleted and time deducted' });
    } catch (error) {
        console.error('Error deleting screenshot and deducting time:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete screenshot and deduct time' });
    }
};

const addEmployeeToProject = async (req, res) => {
    const { pId } = req.params;
    const { userId } = req.body;

    try {
        // Check if the requester is a manager
        const managerId = req.user; // Assuming you have the manager's ID in the request user object

        const manager = await UserSchema.findById(managerId);
        if (!manager) {
            return res.status(404).json({ message: 'Manager not found' });
        }

        // Check if the user exists in the User collection
        const user = await UserSchema.findById(userId);
        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }



        // Update the project by adding the userId
        const updatedProject = await ProjectSchema.findByIdAndUpdate(
            pId, { $addToSet: { userId } }, { new: true, useFindAndModify: false }
        );

        if (!updatedProject) {
            return res.status(404).send({ message: 'Project not found.' });
        }

        // Update the user schema by adding the projectId
        user.projectId.addToSet(pId);
        await user.save();

        res.send(updatedProject);
    } catch (error) {
        console.error('Error updating the Project:', error);
        res.status(500).send({ message: 'Internal server error.' });
    }
};

const removeEmployeeFromProject = async (req, res) => {
    const { pId } = req.params;
    const { userId } = req.body;

    try {
        // Check if the userId exists in the User collection
        const user = await UserSchema.findById(userId);
        if (!user) {
            return res.status(400).send({ message: 'User ID does not exist.' });
        }

        // Find the group
        const project = await ProjectSchema.findById(pId);

        if (!project) {
            return res.status(404).send({ message: 'project not found.' });
        }

        // Check if the user is in the group
        const userIndex = project.userId.findIndex(id => id.toString() === userId);

        if (userIndex === -1) {
            return res.status(400).send({ message: 'User not in the project.' });
        }

        // Remove the user from the group
        project.userId.splice(userIndex, 1);
        await project.save();

        res.send(project);
    } catch (error) {
        console.error('Error updating the Project:', error);
        res.status(500).send({ message: 'Internal server error.' });
    }
};

const updateEmployeeSettings = async (req, res) => {
    const userData = req.body; // Assuming userData is an array of objects, each containing user ID and settings data

    try {
        const updatedSettings = [];

        for (const userDataEntry of userData) {
            const userId = userDataEntry.userId;
            const settingsData = userDataEntry.settings;

            const user = await UserSchema.findById(userId);
            if (!user) {
                // Handle the case where a user is not found
                continue; // Move to the next user
            }

            let settings;

            if (!user.employeeSettings) {
                // Create a new employee settings record if it doesn't exist
                const settingsDataWithUserId = {
                    userId: user._id,
                    ...settingsData, // You might want to process settingsData accordingly
                };

                settings = new EmployeeSettings(settingsDataWithUserId);
                await settings.save();
                user.employeeSettings = settings._id;
                await user.save();
            } else {
                // Update the existing employee settings record
                settings = await EmployeeSettings.findByIdAndUpdate(
                    user.employeeSettings,
                    settingsData,
                    { new: true, runValidators: true }
                );
            }

            if (!settings) {
                // Handle the case where settings are not found
                continue; // Move to the next user
            }

            updatedSettings.push(settings);
        }

        if (updatedSettings.length === 0) {
            // Handle the case where no settings were updated
            return res.status(404).json({ success: false, message: 'No employee settings were updated' });
        }

        res.status(200).json({ success: true, message: 'Employee settings updated', data: updatedSettings });
    } catch (error) {
        console.error('Error updating employee settings:', error);
        res.status(500).json({ success: false, message: 'Failed to update employee settings', error: error });
    }
};

const getEffectiveSettingsEachUser = async (req, res) => {
    const { userId } = req.params;
    try {


        const user = await UserSchema.findOne({ _id: userId }).populate('employeeSettings');

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        var employeeSettings = []
        if (user.employeeSettings) {
            employeeSettings = await EmployeeSettings.findOne({ userId: user._id });
            // Now you can use the employeeSettings object as needed
        }

        return res.status(200).json({ success: true, employeeSettings });
    } catch (error) {
        console.error('Error retrieving employee settings:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

export default { getManagedUsers, getManagerHoursWorked, addEmployeeToProject, removeEmployeeFromProject, deleteScreenshotAndDeductTime, MangerDashboard, updateEmployeeSettings, getEffectiveSettingsEachUser };