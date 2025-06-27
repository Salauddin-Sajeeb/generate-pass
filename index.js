const express = require('express');
const app = express();
app.use(express.json());

const cors = require('cors');
const allowedOrigins = [
  'https://alfread648.wixsite.com',
  'https://alfread648.wixsite.com/pass-generator',
  'https://editor.wix.com',
  undefined // for Postman/local dev
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

const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const key = require('./wallet-service.json'); // Your valid service account key

const auth = new google.auth.GoogleAuth({
  credentials: key,
  scopes: ['https://www.googleapis.com/auth/wallet_object.issuer']
});

app.post('/generate-pass', async (req, res) => {
  const { name, surname, email, points } = req.body;
  const issuerId = process.env.ISSUER_ID;

  if (!email || !name || !surname || !points) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const userId = email.replace(/[^a-zA-Z0-9]/g, '_');
  const objectId = `${issuerId}.${userId}_eventpass`;
  const classId = `${issuerId}.sample_event_class`;

  const classPayload = {
    id: classId,
    issuerName: "Your Brand",
    eventName: {
      defaultValue: {
        language: "en-US",
        value: "Your Event"
      }
    },
    reviewStatus: "UNDER_REVIEW" // Use "APPROVED" in production
  };

  const passPayload = {
    id: objectId,
    classId: classId,
    state: "ACTIVE",
    barcode: {
      type: "QR_CODE",
      value: email
    },
    ticketHolderName: `${name} ${surname}`,
    ticketNumber: `POINTS-${points}`
  };

  try {
    const client = await auth.getClient();
    const wallet = google.walletobjects({ version: 'v1', auth: client });

    // Ensure the class exists (create if missing)
    try {
      await wallet.eventticketclass.get({ resourceId: classId });
    } catch (classError) {
      if (classError.code === 404) {
        await wallet.eventticketclass.insert({ requestBody: classPayload });
      } else {
        throw classError;
      }
    }

    // Insert the pass object
    try {
      await wallet.eventticketobject.insert({ requestBody: passPayload });
    } catch (insertError) {
      if (insertError.code !== 409) {
        console.error("Insert error:", insertError);
        return res.status(500).json({
          error: 'Failed to insert pass object',
          details: insertError.message
        });
      }
      // 409 = object already exists
    }

    // Build JWT for save link
    const jwtPayload = {
      iss: key.client_email,
      aud: 'google',
      typ: 'savetowallet',
      payload: {
        eventTicketObjects: [{ id: objectId }]
      }
    };

    const token = jwt.sign(jwtPayload, key.private_key, {
      algorithm: 'RS256',
      header: {
        kid: key.private_key_id,
        typ: 'JWT',
        alg: 'RS256'
      }
    });

    const saveUrl = `https://pay.google.com/gp/v/save/${token}`;
    res.status(200).json({ walletUrl: saveUrl });

  } catch (e) {
    console.error('Error generating pass:', e);
    res.status(500).json({ error: "Failed to generate pass", details: e.message });
  }
});

app.get("/", (req, res) => {
  res.send("✅ Render backend is running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
