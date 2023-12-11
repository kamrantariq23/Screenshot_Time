/* eslint-disable prefer-destructuring */
/* eslint-disable no-undef */
/* eslint-disable radix */
/* eslint-disable operator-assignment */
/* eslint-disable no-inner-declarations */
/* eslint-disable no-shadow */
/* eslint-disable no-unused-vars */
/* eslint-disable no-plusplus */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-await-in-loop */
// import status from 'http-status';
import status from 'http-status';
import bcryptjs from 'bcryptjs';
import { DateTime } from 'luxon';
import moment from 'moment-timezone';
import UserSchema from '../Models/userSchema';
import TimeTracking from '../Models/timeSchema';
import ProjectSchema from '../Models/projectSchema';


const updateEmployeeToCompany = async (req, res) => {

    try {
        const { name, password, _id, timezone, timezoneOffset } = req.body;

        const hashedPassword = await bcryptjs.hash(password, 12);

        const updateObject = {
            inviteStatus: false,
            name,
            password: hashedPassword,
            timezone,
            timezoneOffset: timezoneOffset.toString(),
        };

        // Use findByIdAndUpdate to update the user by _id
        const user = await UserSchema.findByIdAndUpdate(_id, updateObject, { new: true });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.status(200).json({ success: true, message: 'User created Successfully', user });

    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({
            Message: 'Unable to Create User. Please Try Later.',
            Error: error.message,
        });
    }
}

const addEmployeeToCompany = async (req, res, next) => {
    const { name, password, email, company, userType, timezone, timezoneOffset } = req.body;
    const user = await User.findOne({ email: email })
    if (!user) {
        try {


            const hashedPassword = await bcryptjs.hash(password, 12);

            const newUser = new UserSchema({
                name,
                password: hashedPassword,
                email,
                company,
                userType,
                timezone,
                timezoneOffset: timezoneOffset.toString(), // Assign the string value here
            });

            const savedUser = await newUser.save();
            // io.emit('user-joined', savedUser);
            res.status(200).json({
                Message: 'Account Created Successfully.',
                SavedUser: savedUser,
            });
        } catch (error) {
            console.error('Error creating user:', error);
            res.status(500).json({
                Message: 'Unable to Create User. Please Try Later.',
                Error: error.message,
            });
        }
    }
    else {
        res.status(400).json({ success: false, message: 'Email already exist' });
    }
};


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
                    // Time entries that start and end within the selected period
                    {
                        'timeEntries.startTime': { $gte: periods[period].start, $lt: periods[period].end },
                    },
                    // Time entries that started before the selected period and extend into it
                    {
                        'timeEntries.startTime': { $lt: periods[period].start },
                        'timeEntries.endTime': { $gte: periods[period].start },
                    },
                    // Time entries that start from yesterday and end on today
                    {
                        'timeEntries.startTime': { $lt: periods[period].end },
                        'timeEntries.endTime': { $gte: periods[period].start },
                    },
                ],
            },
        },
    ]);

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



function formatHoursAndMinutes(time) {
    let hours = time.hours || 0;
    let minutes = time.minutes || 0;

    hours = String(hours).padStart(2, '0');
    minutes = String(minutes).padStart(2, '0');

    return `${hours}h ${minutes}m`;
}


const calculateBillingAmount = async (user, period) => {
    const ratePerHour = user.billingInfo ? user.billingInfo.ratePerHour : 0;
    const totalHoursWorked = await calculateHoursWorked(user, period);
    const totalBillingAmount = (totalHoursWorked.hours + totalHoursWorked.minutes / 60) * ratePerHour;
    return Math.round(totalBillingAmount);
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
                latestScreenshot = lastScreenshot;

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

const getTotalHoursWorkedAllEmployeesT = async (req, res) => {
    try {
        const users = await UserSchema.find({ company: req.user.company });
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

        let usersWorkingToday = await Promise.all(
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
                if (user.lastActive > user.createdAt) {
                    const lastActiveTime = user.lastActive;
                    minutesAgo = getTimeAgo(lastActiveTime);
                }

                const currentTime = new Date().getTime();

                const userInfo = {
                    userId: user._id,
                    userName: user.name,
                    recentScreenshot,
                    minutesAgo,
                    isActive: user.isActive,
                    isArchived: user.isArchived,
                    UserStatus: user.inviteStatus,

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
};;


const updateEmployeeSettings = async (req, res) => {
    const { userId } = req.params;

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        let settings;
        if (!user.employeeSettings) {
            // Create a new employee settings record if it doesn't exist
            settings = new EmployeeSettings(req.body);
            await settings.save();

            // Update the user with the new employee settings reference
            user.employeeSettings = settings._id;
            await user.save();
        } else {
            // Update the existing employee settings record
            settings = await EmployeeSettings.findByIdAndUpdate(
                user.employeeSettings,
                req.body, { new: true, runValidators: true }
            );
        }

        if (!settings) {
            return res.status(404).json({ success: false, message: 'Employee settings not found' });
        }

        res.status(200).json({ success: true, message: 'Employee settings updated', data: settings });
    } catch (error) {
        console.error('Error updating employee settings:', error);
        res.status(500).json({ success: false, message: 'Failed to update employee settings' });
        console.log(error);
    }
};

const getTotalHoursWorkedAllEmployees = async (req, res) => {
    try {
        const users = await UserSchema.find({ company: req.user.company });
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
        const onlineUsers = [];

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);
        const startOfThisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());

        const endOfThisWeek = new Date(startOfThisWeek);
        endOfThisWeek.setDate(startOfThisWeek.getDate() + 7); // 6 days added to the start of the week

        const startOfThisMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        const endOfThisMonth = new Date(startOfThisMonth);
        endOfThisMonth.setMonth(startOfThisMonth.getMonth() + 1); // 1 month added to the start of the month
        // 0 day of the next month, which gives the last day of the current month

        const usersWorkingToday = await Promise.all(
            users.map(async (user) => {
                const employeeId = user._id;
                // console.log('usernow:',user._id);

                totalUsers++;



                // Initialize variables to store calculated total hours for the user
                const totalHoursWorked = {
                    daily: 0,
                    weekly: 0,
                    monthly: 0,
                    yesterday: 0,
                };

                const timeTrackings = await TimeTracking.find({ userId: employeeId });

                for (const timeTracking of timeTrackings) {
                    for (const timeEntry of timeTracking.timeEntries) {
                        const startTime = new Date(timeEntry.startTime);
                        let endTime = 0;
                        if (timeEntry.endTime) {
                            endTime = new Date(timeEntry.endTime);
                        } else {
                            const lastScreenshot = timeEntry.screenshots.slice(-1)[0];

                            if (lastScreenshot) {
                                endTime = new Date(lastScreenshot.createdAt);
                            } else {
                                // No screenshots in this timeEntry, skip it
                                continue;
                            }
                        }

                        // console.log('startTime:', startTime);
                        // console.log('endTime:', endTime);

                        const hoursWorked = (endTime - startTime) / (1000 * 60 * 60);

                        // console.log('hoursWorked:', hoursWorked);

                        if (startTime >= startOfToday) {
                            totalHoursWorked.daily += hoursWorked;
                        }

                        if (startTime >= startOfThisWeek && startTime < endOfThisWeek) {
                            totalHoursWorked.weekly += hoursWorked;
                        }

                        if (startTime >= startOfThisMonth && startTime < endOfThisMonth) {
                            totalHoursWorked.monthly += hoursWorked;
                        }

                        if (startTime >= startOfYesterday && startTime < startOfToday) {
                            totalHoursWorked.yesterday += hoursWorked;
                        }
                    }
                }

                console.log('id:', employeeId);
                const recentScreenshot = await retrieveScreenshotsForUser(employeeId);
                if (recentScreenshot) {
                    console.log('Recent screenshot:', recentScreenshot);
                } else {
                    console.log('No recent screenshot found.');
                }
                const lastActiveTime = user.lastActive;
                const minutesAgo = getTimeAgo(lastActiveTime);
                const ratePerHour = user.billingInfo ? user.billingInfo.ratePerHour : 0;
                const billingAmounts = {
                    daily: Math.abs(parseInt(ratePerHour * totalHoursWorked.daily)),
                    weekly: Math.abs(parseInt(ratePerHour * totalHoursWorked.weekly)),
                    monthly: Math.abs(parseInt(ratePerHour * totalHoursWorked.monthly)),
                    yesterday: Math.abs(parseInt(ratePerHour * totalHoursWorked.yesterday)),
                };

                const currentTime = new Date().getTime();
                const timeDiff = currentTime - lastActiveTime;
                const inactiveThreshold = 5 * 60 * 1000; // 5 minutes in milliseconds
                const isActive = user.isActive;




                const userInfo = {
                    userId: user._id,
                    userName: user.name,
                    recentScreenshot,
                    minutesAgo,
                    isActive,
                    isArchived: user.isArchived,
                    totalHours: {
                        daily: formatHoursAndMinutes(totalHoursWorked.daily),
                        yesterday: formatHoursAndMinutes(totalHoursWorked.yesterday),
                        weekly: formatHoursAndMinutes(totalHoursWorked.weekly),
                        monthly: formatHoursAndMinutes(totalHoursWorked.monthly),
                    },
                    billingAmounts: {
                        daily: Math.abs(parseInt(ratePerHour * totalHoursWorked.daily)),
                        weekly: Math.abs(parseInt(ratePerHour * totalHoursWorked.weekly)),
                        monthly: Math.abs(parseInt(ratePerHour * totalHoursWorked.monthly)),
                        yesterday: Math.abs(parseInt(ratePerHour * totalHoursWorked.yesterday)),
                    },



                };
                totalHoursAll.daily += totalHoursWorked.daily;
                totalHoursAll.yesterday += totalHoursWorked.yesterday;

                totalHoursAll.weekly += totalHoursWorked.weekly;

                totalHoursAll.monthly += totalHoursWorked.monthly;





                totalBillingAll.daily += billingAmounts.daily;
                totalBillingAll.yesterday += billingAmounts.yesterday;
                totalBillingAll.weekly += billingAmounts.weekly;
                totalBillingAll.monthly += billingAmounts.monthly;

                if (isActive) {
                    onlineUsers.push(userInfo);
                } else if (totalHoursWorked.daily.hours > 0 || totalHoursWorked.daily.minutes > 0) {
                    totalUsersWorkingToday++;
                    onlineUsers.push(userInfo);
                } else {
                    offlineUsers.push(userInfo);
                }
            })
        );

        const formatHoursAndMinutest = (hoursDecimal) => {
            const hours = Math.floor(hoursDecimal);
            const minutes = Math.round((hoursDecimal - hours) * 60);
            return { hours, minutes };
        };
        // Format the summed total hours using the formatHoursAndMinutes function
        const formattedTotalHoursAll = {
            daily: formatHoursAndMinutest(totalHoursAll.daily),
            yesterday: formatHoursAndMinutest(totalHoursAll.yesterday),
            weekly: formatHoursAndMinutest(totalHoursAll.weekly),
            monthly: formatHoursAndMinutest(totalHoursAll.monthly),
        };

        return res.json({
            success: true,
            totalUsers,
            onlineUsers,
            totalActiveUsers: onlineUsers.length,
            totalUsersWorkingToday: onlineUsers.length,
            offlineUsers,
            offlineUsersTotal: offlineUsers.length,

            totalHours: formattedTotalHoursAll,
            totalBillingAmounts: totalBillingAll,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};



// Define other necessary functions (calculateHoursWorked, calculateBillingAmount, etc.)









const deleteActivity = async (req, res) => {
    try {
        const { timeTrackingId, timeEntryId } = req.params;
        console.log(timeTrackingId, timeEntryId);
        // Find the time tracking document by ID
        const timeTracking = await TimeTracking.findById(timeTrackingId);

        if (!timeTracking) {
            return res.status(404).json({ success: false, message: 'Time tracking document not found' });
        }

        // Find the timeEntry to be deleted by ID
        const foundTimeEntry = timeTracking.timeEntries.find((timeEntry) => timeEntry._id.toString() === timeEntryId);

        if (!foundTimeEntry) {
            return res.status(404).json({ success: false, message: 'timeEntry not found' });
        }
        const cloneTimeEntry = JSON.parse(JSON.stringify(foundTimeEntry)); // Deep clone the object

        const deleteActivity = {
            startTime: foundTimeEntry.startTime,
            endTime: foundTimeEntry.endTime,
            changeTime: new Date(),
            editedBy: req.user._id,
            scope: 'delete timeEntry',
            change: `delete Activity from ${foundTimeEntry.startTime} to ${foundTimeEntry.endTime}`,
            screenshots: foundTimeEntry.screenshots.map(screenshot => JSON.parse(JSON.stringify(screenshot))),
            historyChanges: [{
                changeTime: new Date(),
                editedBy: req.user._id,
                previousData: cloneTimeEntry, // Store the deep clone in historyChanges
            }],
        };

        // Step 7: Push the new activity to the activities array
        foundTimeEntry.activities.push(deleteActivity);
        foundTimeEntry.screenshots = [];
        // Step 7: Push the new activity to the activities array
        foundTimeEntry.deletedBy = req.user._id;
        foundTimeEntry.deletedAt = new Date()
        foundTimeEntry.endTime = new Date(foundTimeEntry.startTime)
        // Remove the timeEntry from the time tracking document

        await timeTracking.save();

        // Return success response
        res.status(200).json({ success: true, message: 'timeEntry deleted successfully' });
    } catch (error) {
        console.error('Error deleting timeEntry:', error);
        res.status(500).json({ success: false, message: 'Failed to delete timeEntry' });
    }
};






const getEvents = async (req, res) => {

    try {


        const employees = await UserSchema.find({ company: req.user.company });
        const employeeCount = employees.length;

        res.status(status.OK).json({
            employees,
            count: employeeCount,
        });
    } catch (err) {
        console.error('Error fetching company employees:', err);
        res.status(status.INTERNAL_SERVER_ERROR).json({
            Message: 'Error fetching company employees',
            Error: err.message,
        });
    }
};

const getcompanyemployees = (req, res) => {

    const { com } = req.params;
    UserSchema.find({ company: com, isArchived: true })
        .then(events => {
            res.status(status.OK).send(events);
        })
        .catch(err => {
            res.status(status.INTERNAL_SERVER_ERROR).send({
                Message: 'No Events!',
                err,
            });
        });
};
const updateUserArchiveStatus = async (req, res) => {
    const { userId } = req.params;
    const { isArchived } = req.body;

    try {
        const user = await UserSchema.findByIdAndUpdate(userId, { isArchived }, { new: true });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Archive all users with the same company as the user being archived
        if (isArchived) {
            await UserSchema.updateMany({ company: user.company }, { isArchived: true });
        }

        res.status(200).json({ success: true, message: 'User archive status updated', user });
    } catch (error) {
        console.error('Error updating user archive status:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};

const deleteEmployee = async (req, res) => {
    const { userId } = req.params;
    const { isArchived } = req.body;

    try {
        const user = await UserSchema.findByIdAndUpdate(userId, { isArchived }, { new: true });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.status(200).json({ success: true, message: 'User archive status updated', user });
    } catch (error) {
        console.error('Error updating user archive status:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};

const converttimezone = (time, timezone) => {

    const originalTime = DateTime.fromJSDate(time);
    const convertedTime = originalTime.setZone(timezone);
    //  // Log the original and converted times
    // console.log('Original Time:', originalTime.toString());
    // console.log('Converted Time:', convertedTime.toString());
    return convertedTime;
};
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

const getTotalHoursAndScreenshots = async (req, res) => {
    const { userId } = req.params;
    const date = req.query.date ? new Date(req.query.date) : new Date();

    const converttimezone = (time, timezone) => {

        const originalTime = DateTime.fromJSDate(time);
        const convertedTime = originalTime.setZone(timezone);
        //  // Log the original and converted times
        // console.log('Original Time:', originalTime.toString());
        // console.log('Converted Time:', convertedTime.toString());
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
                // let startTime = new Date(startconv);
                // if (startTime >= startOfThisMonth && startTime < endOfThisMonth) {
                let screenshotTimeRange = 0

                if (startTime >= startOfToday && startTime < endOfToday && endTime > endOfToday) {
                    // Create a new time entry for the next day starting at 12:00 AM
                    newTimeEntry = { ...timeEntry };
                    newTimeEntry.startTime = endTime.startOf('day');

                    newTimeEntry.endTime = new Date(endTime);

                    // Modify the endTime of the original time entry to be 11:59:59.999 PM of the current day
                    // timeEntry.startTime = new Date(startTime);
                    // startTime = setHoursDifference(timeEntry.startTime, req.user.timezoneOffset, req.user.timezone)
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
                    //  (endTime - timeEntry.startTime) / (1000 * 60 * 60);

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
                // Check if the time entry has offline activities
                // if (timeEntry.activities && timeEntry.activities.length > 0) {
                //     const offlineActivities = timeEntry.activities.filter((activity) => activity.offline);
                //     if (offlineActivities.length > 0) {
                //         const offlineDuration = offlineActivities.reduce((total, activity) => {
                //             const activityStartTime = new Date(activity.startTime);
                //             const activityEndTime = new Date(activity.endTime);

                //             // Only consider offline activities within today's range
                //             if (activityStartTime >= startTime && activityEndTime >= startTime && activityEndTime < endTime) {
                //                 return total + (activityEndTime - activityStartTime);
                //             }

                //             return total;
                //         }, 0);

                //         // Add the offline duration to the daily hours worked
                //         totalHoursWorked.daily += offlineDuration / (1000 * 60 * 60);

                //         for (const activity of offlineActivities) {
                //             const activityStartTime = new Date(activity.startTime);
                //             const activityEndTime = new Date(activity.endTime);
                //             const timeRange = `${activityStartTime.toString()} - ${activityEndTime.toString()} (offline)`;
                //             // const timerangeconv = converttimezone(timeRange, usertimezone)

                //             groupedScreenshots.push({ time: timeRange });
                //         }

                //     }
                // }

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
                // }

            }
        }

        totalHoursWorked.daily = Math.max(totalHoursWorked.daily, 0);
        totalHoursWorked.weekly = Math.max(totalHoursWorked.weekly, 0);
        totalHoursWorked.monthly = Math.max(totalHoursWorked.monthly, 0);


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

const getTotalHoursByDay = async (req, res) => {
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

        // Convert user input to the application's standard time zone
        const userDateTime = setHoursDifference(date, req.user.timezoneOffset, req.user.timezone)

        // Perform calculations in the standard time zone
        const startOfToday = userDateTime.startOf('day');
        const endOfToday = userDateTime.endOf('day');

        const timeTrackings = await TimeTracking.find({ userId });

        var newTimeEntry = [];
        const totalHoursByDay = [];

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
        // const now = new Date();
        for (let i = 1; i <= userDateTime.daysInMonth; i++) {
            const currentDay = userDateTime.set({ day: i });

            // Calculate start and end of the current day
            const startOfDay = currentDay.startOf('day');
            const endOfDay = currentDay.endOf('day');

            // Initialize total hours worked for the current day
            let totalHoursForDay = 0;

            for (const timeTracking of timeTrackings) {
                for (const timeEntry of timeTracking.timeEntries) {
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
                    // let startTime = new Date(startconv);
                    if (startTime >= startOfToday && startTime < endOfToday && endTime > endOfToday) {
                        // Create a new time entry for the next day starting at 12:00 AM
                        newTimeEntry = { ...timeEntry };
                        newTimeEntry.startTime = endTime.startOf('day');

                        newTimeEntry.endTime = new Date(endTime);

                        // Modify the endTime of the original time entry to be 11:59:59.999 PM of the current day
                        // timeEntry.startTime = new Date(startTime);
                        // startTime = setHoursDifference(timeEntry.startTime, req.user.timezoneOffset, req.user.timezone)
                        timeEntry.endTime = startTime.endOf('day');
                        endTime = DateTime.fromJSDate(timeEntry.endTime, { zone: req.user.timezone });

                    } else if (startTime < startOfToday && endTime >= startOfToday && endTime < endOfToday) {
                        newTimeEntry = { ...timeEntry };
                        newTimeEntry.startTime = new Date(startTime);
                        newTimeEntry.endTime = startTime.endOf('day');

                        // Modify the endTime of the original time entry to be 11:59:59.999 PM of the current day

                        timeEntry.startTime = endTime.startOf('day');
                        startTime = DateTime.fromJSDate(timeEntry.startTime, { zone: req.user.timezone });


                    }
                    if (startTime >= startOfDay && startTime < endOfDay) {
                        // Calculate the hours worked for the time entry
                        const hoursWorkedd = (Math.min(endOfDay, endTime) - Math.max(startOfDay, startTime)) / (1000 * 60 * 60);
                        totalHoursForDay += Math.max(hoursWorkedd, 0);
                    }
                    if (newTimeEntry.startTime >= startOfDay && newTimeEntry.startTime < endOfDay) {
                        // Calculate the hours worked for the time entry
                        const hoursWorkedd = (Math.min(endOfDay, newTimeEntry.endTime) - Math.max(startOfDay, newTimeEntry.startTime)) / (1000 * 60 * 60);
                        totalHoursForDay += Math.max(hoursWorkedd, 0);
                    }

                }
            }
            // Add total hours for the current day to the array
            let dayhours = formatTime(Math.max(totalHoursForDay, 0))
            totalHoursByDay.push({
                date: currentDay.toFormat('d-L-yyyy'),
                totalHours: dayhours,
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                totalHoursByDay,
                timezone: user.timezone,
                name: user.name,
                email: user.email,
                usertype: user.userType,
                startOfToday: startOfToday,
                endOfToday: endOfToday,
            },
        });
    } catch (error) {
        console.error('Error getting total hours and screenshots:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const getTotalHoursAndScreenshotstest = async (req, res) => {
    const { userId } = req.params;
    const date = req.query.date ? new Date(req.query.date) : new Date();

    const converttimezone = (time, timezone) => {

        const originalTime = DateTime.fromJSDate(time);
        const convertedTime = originalTime.setZone(timezone);
        //  // Log the original and converted times
        // console.log('Original Time:', originalTime.toString());
        // console.log('Converted Time:', convertedTime.toString());
        return convertedTime;
    };



    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const ratePerHour = user.billingInfo ? user.billingInfo.ratePerHour : 0;

        const startOfToday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const endOfToday = new Date(startOfToday);
        endOfToday.setDate(startOfToday.getDate() + 1);
        const startOfThisWeek = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
        const endOfThisWeek = new Date(startOfThisWeek);
        endOfThisWeek.setDate(startOfThisWeek.getDate() + 7); // 6 days added to the start of the week

        const startOfThisMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        const endOfThisMonth = new Date(startOfThisMonth);
        endOfThisMonth.setMonth(startOfThisMonth.getMonth() + 1); // 1 month added to the start of the month
        // 0 day of the next month, which gives the last day of the current month

        const timeTrackings = await TimeTracking.find({ userId });

        const totalHoursWorked = {
            daily: 0,
            weekly: 0,
            monthly: 0,
            offline: 0,
        };

        const groupedScreenshots = [];

        const now = new Date(); // Current time for handling ongoing time entries

        for (const timeTracking of timeTrackings) {
            for (const timeEntry of timeTracking.timeEntries) {
                let startTime = converttimezone(timeEntry.startTime, req.user.timezone);
                let endTime = timeEntry.endTime ? converttimezone(timeEntry.endTime, req.user.timezone) : converttimezone(now, req.user.timezone);
                // Check if endTime is earlier than startTime, and if so, swap them
                if (endTime < startTime) {
                    [startTime, endTime] = [endTime, startTime];
                }

                // Calculate the hours worked using the corrected start and end times
                const hoursWorked = (endTime - startTime) / (1000 * 60 * 60);

                // Check if the time entry is within today
                if (startTime >= startOfToday && startTime < endOfToday) {
                    totalHoursWorked.daily += hoursWorked;

                    // Check if the time entry has offline activities
                    // if (timeEntry.activities && timeEntry.activities.length > 0) {
                    //     const offlineActivities = timeEntry.activities.filter((activity) => activity.offline);
                    //     if (offlineActivities.length > 0) {
                    //         const offlineDuration = offlineActivities.reduce((total, activity) => {
                    //             const activityStartTime = new Date(activity.startTime);
                    //             const activityEndTime = new Date(activity.endTime);

                    //             // Only consider offline activities within today's range
                    //             if (activityStartTime >= startTime && activityEndTime >= startTime && activityEndTime < endTime) {
                    //                 return total + (activityEndTime - activityStartTime);
                    //             }

                    //             return total;
                    //         }, 0);

                    //         // Add the offline duration to the daily hours worked
                    //         totalHoursWorked.daily += offlineDuration / (1000 * 60 * 60);

                    //         for (const activity of offlineActivities) {
                    //             const activityStartTime = new Date(activity.startTime);
                    //             const activityEndTime = new Date(activity.endTime);
                    //             const timeRange = `${activityStartTime.toString()} - ${activityEndTime.toString()} (offline)`;

                    //             groupedScreenshots.push({ time: timeRange });
                    //         }
                    //     }
                    // }

                    // Check if the time entry has screenshots taken today
                    if (timeEntry.screenshots && timeEntry.screenshots.length > 0) {
                        const screenshotsToday = timeEntry.screenshots.filter((screenshot) => {
                            const screenshotTime = new Date(screenshot.createdAt);
                            return screenshotTime >= startOfToday && screenshotTime < endOfToday;
                        });

                        if (screenshotsToday.length > 0) {
                            if (startTime instanceof Date && endTime instanceof Date) {
                                const screenshotStartTime = startTime.toLocaleTimeString([], { hour: 'numeric', minute: 'numeric' });
                                const screenshotEndTime = endTime.toLocaleTimeString([], { hour: 'numeric', minute: 'numeric' });

                                const screenshotTimeRange = `${screenshotStartTime} - ${screenshotEndTime}`;
                                // const screenshotTimeRangeConv = converttimezone(screenshotTimeRange, usertimezone)


                                const screenshotDetails = screenshotsToday.map((screenshot) => {
                                    const convertedCreatedAt = converttimezone(screenshot.createdAt, req.user.timezone);
                                    return {
                                        _id: screenshot._id,
                                        key: screenshot.key,
                                        description: screenshot.description,
                                        time: convertedCreatedAt.toFormat('h:mm a'),
                                        trackingId: timeTracking._id,
                                    };
                                });

                                groupedScreenshots.push({
                                    time: screenshotTimeRange,
                                    screenshots: screenshotDetails,
                                });
                                if (startTime >= startOfToday) {
                                    activityData.daily.visitedUrls.push(...timeEntry.visitedUrls);
                                }

                                if (startTime >= startOfThisWeek && startTime < endOfThisWeek) {
                                    activityData.weekly.visitedUrls.push(...timeEntry.visitedUrls);
                                }

                                if (startTime >= startOfThisMonth && startTime < endOfThisMonth) {
                                    activityData.monthly.visitedUrls.push(...timeEntry.visitedUrls);
                                }
                            }
                        }
                    }
                }

                if (startTime >= startOfThisWeek && startTime < endOfThisWeek) {
                    totalHoursWorked.weekly += hoursWorked;
                }

                if (startTime >= startOfThisMonth && startTime < endOfThisMonth) {
                    totalHoursWorked.monthly += hoursWorked;
                }
            }
        }

        totalHoursWorked.daily = Math.max(totalHoursWorked.daily, 0);
        totalHoursWorked.weekly = Math.max(totalHoursWorked.weekly, 0);
        totalHoursWorked.monthly = Math.max(totalHoursWorked.monthly, 0);


        const formatTime = (time) => {
            const hours = Math.floor(time);
            const minutes = Math.round((time - hours) * 60);
            return `${hours}h ${minutes}m`;
        };

        const formattedTotalHoursWorked = {
            daily: formatTime(totalHoursWorked.daily),
            weekly: formatTime(totalHoursWorked.weekly),
            monthly: formatTime(totalHoursWorked.monthly),
        };

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
                activityData,
                timezone: user.timezone,
                name: user.name,
            },
        });
    } catch (error) {
        console.error('Error getting total hours and screenshots:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const getSingleEmployee = (req, res) => {
    const { eid } = req.params;

    UserSchema.findOne({ _id: eid })
        .then(event => {
            if (!event) {
                return res.status(status.NOT_FOUND).send({
                    Message: 'user not found',
                });
            }
            return res.status(status.OK).send(event);
        })
        .catch(err => {
            return res.status(status.INTERNAL_SERVER_ERROR).send({
                Message: 'Internal Server Error',
                err,
            });
        });
};



export default { getEvents, updateEmployeeSettings, deleteActivity, getcompanyemployees, getSingleEmployee, getTotalHoursByDay, getTotalHoursAndScreenshotstest, getTotalHoursWorkedAllEmployeesT, updateUserArchiveStatus, getTotalHoursAndScreenshots, updateEmployeeToCompany, addEmployeeToCompany, deleteEmployee, getTotalHoursWorkedAllEmployees };