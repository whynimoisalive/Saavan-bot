const express = require('express');
const app = express();

// Render gives us a PORT variable
const PORT = process.env.PORT || 3000;

// Health endpoint
app.get('/', (req, res) => {
  res.send('OK');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
