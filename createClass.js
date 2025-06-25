
const { google } = require('googleapis');
const key = require('./wallet-service.json');
require('dotenv').config();

const auth = new google.auth.GoogleAuth({
  credentials: key,
  scopes: ['https://www.googleapis.com/auth/wallet_object.issuer']
});

async function createClass() {
  const service = google.walletobjects({ version: 'v1', auth });
  const issuerId = process.env.ISSUER_ID;
  const classId = `${issuerId}.sample_event_class`;

  const classPayload = {
    id: classId,
    issuerName: "Test Business",
    reviewStatus: "UNDER_REVIEW",
    eventName: {
      defaultValue: {
        language: "en-US",
        value: "Sample Event"
      }
    },
    venue: {
      defaultValue: {
        language: "en-US",
        value: "Virtual"
      }
    }
  };

  try {
    await service.eventticketclass.insert({ requestBody: classPayload });
    console.log('✅ Class created.');
  } catch (e) {
    if (e.code === 409) {
      console.log('ℹ️ Class already exists.');
    } else {
      console.error(e);
    }
  }
}

createClass();
