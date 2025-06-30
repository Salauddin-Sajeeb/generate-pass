const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());

// Allow Wix editor + site
const allowedOrigins = [
  'https://alfread648.wixsite.com',
  'https://alfread648.wixsite.com/pass-generator',
  'https://editor.wix.com',
  undefined // for local testing
];

app.use(cors({
  origin: (origin, callback) => {
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// Load service account key
const key = require('./wallet-service.json');
const issuerId = process.env.ISSUER_ID;

// Google Auth setup
const auth = new google.auth.GoogleAuth({
  credentials: key,
  scopes: ['https://www.googleapis.com/auth/wallet_object.issuer']
});

// POST route to generate pass
app.post('/generate-pass', async (req, res) => {
  const { name, surname, email, points } = req.body;

  if (!name || !surname || !email || !points) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const client = await auth.getClient();
    const wallet = google.walletobjects({ version: 'v1', auth: client });

    const userId = email.replace(/[^a-zA-Z0-9]/g, '_');
    const objectId = `${issuerId}.${userId}_eventpass`;
    const classId = `${issuerId}.sample_event_class`;

    // Create class if not exists
    try {
      await wallet.eventticketclass.get({ resourceId: classId });
    } catch (error) {
      if (error.code === 404) {
        await wallet.eventticketclass.insert({
          requestBody: {
            id: classId,
            issuerName: "Your Brand Name",
            eventName: {
              defaultValue: {
                language: "en-US",
                value: "My Event Ticket"
              }
            },
            venue: {
              name: "Online Venue",
              address: "123 Cloud Blvd"
            },
            reviewStatus: "UNDER_REVIEW"
          }
        });
      } else {
        throw error;
      }
    }

    // Create the object
    try {
      await wallet.eventticketobject.insert({
        requestBody: {
          id: objectId,
          classId: classId,
          state: "ACTIVE",
          barcode: {
            type: "QR_CODE",
            value: email
          },
          ticketHolderName: `${name} ${surname}`,
          ticketNumber: `POINTS-${points}`
        }
      });
    } catch (error) {
      if (error.code !== 409) {
        return res.status(500).json({
          error: 'Failed to insert pass object',
          details: error.message
        });
      }
    }

    // Generate the JWT for "Save to Wallet"
    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      iss: key.client_email,
      aud: 'https://www.googleapis.com/oauth2/v4/token',
      typ: 'savetowallet',
      iat: now,
      exp: now + 3600,
      payload: {
        eventTicketObjects: [{ id: objectId }]
      }
    };

    const token = jwt.sign(jwtPayload, key.private_key, {
      algorithm: 'RS256'
    });

    const walletUrl = `https://pay.google.com/gp/v/save/${token}`;
    return res.status(200).json({ walletUrl });

  } catch (error) {
    console.error("❌ Error:", error);
    return res.status(500).json({
      error: 'Failed to generate pass',
      details: error.message
    });
  }
});

// Test route
app.get('/', (req, res) => {
  res.send('✅ Wallet pass backend is running');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
