const express = require('express');
const app = express();
require('dotenv').config();
app.use(express.json());
console.log("ISSUER:", process.env.ISSUER_ID);
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
const { JWT } = require('google-auth-library'); // ✅ Use this to sign JWT correctly
require('dotenv').config();
const key = require('./wallet-service.json'); // ✅ Valid service account JSON

const issuerId = process.env.ISSUER_ID;

app.post('/generate-pass', async (req, res) => {
  const { name, surname, email, points } = req.body;

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
    const auth = new google.auth.GoogleAuth({
      credentials: key,
      scopes: ['https://www.googleapis.com/auth/wallet_object.issuer']
    });

    const client = await auth.getClient();
    const wallet = google.walletobjects({ version: 'v1', auth: client });

    // Check or create class
    try {
      await wallet.eventticketclass.get({ resourceId: classId });
    } catch (classError) {
      if (classError.code === 404) {
        await wallet.eventticketclass.insert({ requestBody: classPayload });
      } else {
        throw classError;
      }
    }

    // Insert pass object
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
    }

    // ✅ Use google-auth-library to sign the custom JWT correctly
    const jwtSigner = new JWT({
      email: key.client_email,
      key: key.private_key,
      keyId: key.private_key_id
    });

    const jwtPayload = {
      iss: key.client_email,
      aud: 'google',
      typ: 'savetowallet',
      payload: {
        eventTicketObjects: [
          {
            id: objectId
          }
        ]
      }
    };

    const token = require('jsonwebtoken').sign(jwtPayload, key.private_key, {
      algorithm: 'RS256',
      header: {
        kid: key.private_key_id
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
