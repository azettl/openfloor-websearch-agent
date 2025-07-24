import app from './web-search-server';

// Start the server
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Web Search Agent server running on port ${PORT}`);
});
