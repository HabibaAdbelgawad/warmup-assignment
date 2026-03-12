const fs = require("fs");

function toSeconds(time) {
    let [t, period] = time.split(" ");
    let [h, m, s] = t.split(":").map(Number);

    if (period === "pm" && h !== 12) h += 12;
    if (period === "am" && h === 12) h = 0;

    return h * 3600 + m * 60 + s;
}

function secondsToHMS(sec) {
    let h = Math.floor(sec / 3600);
    sec %= 3600;
    let m = Math.floor(sec / 60);
    let s = sec % 60;

    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getShiftDuration(startTime, endTime) {
    let start = toSeconds(startTime);
    let end = toSeconds(endTime);
    return secondsToHMS(end - start);
}

function getIdleTime(startTime, endTime) {
    let start = toSeconds(startTime);
    let end = toSeconds(endTime);

    let deliveryStart = toSeconds("8:00:00 am");
    let deliveryEnd = toSeconds("10:00:00 pm");

    let idle = 0;

    if (start < deliveryStart) {
        idle += Math.min(end, deliveryStart) - start;
    }

    if (end > deliveryEnd) {
        idle += end - Math.max(start, deliveryEnd);
    }

    return secondsToHMS(idle);
}

function getActiveTime(shiftDuration, idleTime) {
    let [sh, sm, ss] = shiftDuration.split(":").map(Number);
    let [ih, im, is] = idleTime.split(":").map(Number);

    let shiftSec = sh * 3600 + sm * 60 + ss;
    let idleSec = ih * 3600 + im * 60 + is;

    return secondsToHMS(shiftSec - idleSec);
}

function metQuota(date, activeTime) {
    let [y, m, d] = date.split("-").map(Number);

    let [h, min, s] = activeTime.split(":").map(Number);
    let activeSec = h * 3600 + min * 60 + s;

    let quota;

    if (y === 2025 && m === 4 && d >= 10 && d <= 30) {
        quota = 6 * 3600;
    } else {
        quota = (8 * 3600) + (24 * 60);
    }

    return activeSec >= quota;
}

function addShiftRecord(textFile, shiftObj) {

    let data = fs.readFileSync(textFile, "utf8").trim();
    let lines = data.length ? data.split("\n") : [];

    for (let line of lines) {
        let cols = line.split(",");
        if (cols[0] === shiftObj.driverID && cols[2] === shiftObj.date) {
            return {};
        }
    }

    let shiftDuration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    let idleTime = getIdleTime(shiftObj.startTime, shiftObj.endTime);
    let activeTime = getActiveTime(shiftDuration, idleTime);
    let quotaMet = metQuota(shiftObj.date, activeTime);

    let newRow = [
        shiftObj.driverID,
        shiftObj.driverName,
        shiftObj.date,
        shiftObj.startTime,
        shiftObj.endTime,
        shiftDuration,
        idleTime,
        activeTime,
        quotaMet,
        false
    ].join(",");

    let insertIndex = lines.length;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith(shiftObj.driverID + ",")) {
            insertIndex = i + 1;
        }
    }

    lines.splice(insertIndex, 0, newRow);

    fs.writeFileSync(textFile, lines.join("\n"));

    return {
        driverID: shiftObj.driverID,
        driverName: shiftObj.driverName,
        date: shiftObj.date,
        startTime: shiftObj.startTime,
        endTime: shiftObj.endTime,
        shiftDuration: shiftDuration,
        idleTime: idleTime,
        activeTime: activeTime,
        metQuota: quotaMet,
        hasBonus: false
    };
}

function setBonus(textFile, driverID, date, newValue) {

    let lines = fs.readFileSync(textFile, "utf8").trim().split("\n");

    for (let i = 0; i < lines.length; i++) {
        let cols = lines[i].split(",");

        if (cols[0] === driverID && cols[2] === date) {
            cols[9] = newValue;
            lines[i] = cols.join(",");
        }
    }

    fs.writeFileSync(textFile, lines.join("\n"));
}

function countBonusPerMonth(textFile, driverID, month) {

    let lines = fs.readFileSync(textFile, "utf8").trim().split("\n");

    let count = 0;
    let found = false;

    for (let line of lines) {
        let cols = line.split(",");

        if (cols[0] === driverID) {
            found = true;

            let m = Number(cols[2].split("-")[1]);

            if (m === Number(month) && cols[9] === "true") {
                count++;
            }
        }
    }

    return found ? count : -1;
}

function getTotalActiveHoursPerMonth(textFile, driverID, month) {

    let lines = fs.readFileSync(textFile, "utf8").trim().split("\n");

    let total = 0;

    for (let line of lines) {
        let cols = line.split(",");

        if (cols[0] === driverID) {
            let m = Number(cols[2].split("-")[1]);

            if (m === Number(month)) {
                let [h, mi, s] = cols[7].split(":").map(Number);
                total += h * 3600 + mi * 60 + s;
            }
        }
    }

    return secondsToHMS(total);
}

function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {

    let lines = fs.readFileSync(textFile, "utf8").trim().split("\n");
    let rateLines = fs.readFileSync(rateFile, "utf8").trim().split("\n");

    let dayOff = null;

    for (let r of rateLines) {
        let cols = r.split(",");
        if (cols[0] === driverID) {
            dayOff = cols[1];
        }
    }

    let total = 0;

    for (let line of lines) {

        let cols = line.split(",");

        if (cols[0] === driverID) {

            let [y, m, d] = cols[2].split("-").map(Number);

            if (m === Number(month)) {

                let dateObj = new Date(cols[2]);
                let dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" });

                if (dayName === dayOff) continue;

                let quota;

                if (y === 2025 && m === 4 && d >= 10 && d <= 30) {
                    quota = 6 * 3600;
                } else {
                    quota = (8 * 3600) + (24 * 60);
                }

                total += quota;
            }
        }
    }

    total -= bonusCount * 2 * 3600;

    return secondsToHMS(total);
}

function getNetPay(driverID, actualHours, requiredHours, rateFile) {

    let lines = fs.readFileSync(rateFile, "utf8").trim().split("\n");

    let basePay;
    let tier;

    for (let line of lines) {
        let cols = line.split(",");
        if (cols[0] === driverID) {
            basePay = Number(cols[2]);
            tier = Number(cols[3]);
        }
    }

    let allowance = {1:50, 2:20, 3:10, 4:3}[tier];

    let [ah, am, as] = actualHours.split(":").map(Number);
    let [rh, rm, rs] = requiredHours.split(":").map(Number);

    let actual = ah * 3600 + am * 60 + as;
    let required = rh * 3600 + rm * 60 + rs;

    if (actual >= required) return basePay;

    let missing = required - actual;

    let missingHours = Math.floor(missing / 3600);

    let billable = Math.max(0, missingHours - allowance);

    let deductionRate = Math.floor(basePay / 185);

    let deduction = billable * deductionRate;

    return basePay - deduction;
}


