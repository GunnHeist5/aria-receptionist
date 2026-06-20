'use strict';
module.exports = {
  // false = AI scores + ranks, you approve before offer goes out
  // true  = AI sends offer automatically (flip only after screening criteria are proven)
  AUTONOMOUS_OFFERS: process.env.AUTONOMOUS_OFFERS === 'true',

  // false = AI proposes offboarding to you via Telegram, you approve/deny
  // true  = AI executes offboarding autonomously (flip only after you've validated its judgment)
  AUTONOMOUS_OFFBOARDING: process.env.AUTONOMOUS_OFFBOARDING === 'true',

  // Days of zero activity before AI sends a re-engagement message
  INACTIVITY_REENGAGEMENT_DAYS: parseInt(process.env.INACTIVITY_REENGAGEMENT_DAYS ?? '10'),

  // Days of zero activity + no re-engagement response before offboarding is proposed
  INACTIVITY_OFFBOARD_DAYS: parseInt(process.env.INACTIVITY_OFFBOARD_DAYS ?? '21'),

  // Minimum re-engagement attempts before any offboarding proposal can be generated
  MIN_REENGAGEMENT_ATTEMPTS: parseInt(process.env.MIN_REENGAGEMENT_ATTEMPTS ?? '2'),

  // Coaching schedule: hour of day (UTC) to run daily coaching batch
  COACHING_HOUR_UTC: parseInt(process.env.COACHING_HOUR_UTC ?? '14'),
};
