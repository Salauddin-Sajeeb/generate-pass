// index.js
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(express.json());

// 🔐 CORS (allow Wix + Postman)
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin.includes('wixsite.com') || origin.includes('editor.wix.com')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// 🔑 Load service account key
const key = require('./wallet-service.json');
const issuerId = process.env.ISSUER_ID;

const auth = new google.auth.GoogleAuth({
  credentials: key,
  scopes: ['https://www.googleapis.com/auth/wallet_object.issuer']
});

// 🎟️ Generate Pass Route
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

    // ✅ Ensure the class exists
    try {
      await wallet.eventticketclass.get({ resourceId: classId });
    } catch (error) {
      if (error.code === 404) {
        await wallet.eventticketclass.insert({
          requestBody: {
            id: classId,
            issuerName: "Your Brand",
            eventName: {
              defaultValue: {
                language: "en-US",
                value: "My Sample Event"
              }
            },
            venue: {
              name: {
                defaultValue: {
                  language: "en-US",
                  value: "Online Venue"
                }
              },
              address: {
                defaultValue: {
                  language: "en-US",
                  value: "123 Cloud Blvd"
                }
              }
            },
            reviewStatus: "UNDER_REVIEW" // Set to APPROVED once reviewed
          }
        });
      } else {
        throw error;
      }
    }

    // ✅ Insert or ignore object
    try {
      await wallet.eventticketobject.insert({
        requestBody: {
          id: objectId,
          classId,
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

    // ✅ Create JWT (Save to Wallet)
    const jwtPayload = {
      iss: key.client_email,
      aud: 'google',
      typ: 'savetowallet',
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
    console.error('❌ Error generating pass:', error);
    return res.status(500).json({
      error: 'Failed to generate pass',
      details: error.message
    });
  }
});

// ✅ Health Check
app.get('/', (req, res) => {
  res.send('✅ Google Wallet Pass Generator is running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
