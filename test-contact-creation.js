// Test script to verify contact creation works
const fetch = require('node-fetch');

const API_URL = 'http://localhost:8001';
const TENANT_ID = '709c2527-e44d-4835-b56d-a05c3d7e6d83';

async function testContactCreation() {
  console.log('Testing contact creation...\n');

  const contactData = {
    firstName: 'Test',
    lastName: 'User',
    email: `test.user.${Date.now()}@example.com`, // Unique email to avoid duplicates
  };

  try {
    const response = await fetch(`${API_URL}/api/tenants/${TENANT_ID}/crm/contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Note: You'll need to add authentication headers if required
      },
      body: JSON.stringify(contactData),
    });

    const data = await response.json();

    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log('\n✅ Contact created successfully!');
    } else {
      console.log('\n❌ Failed to create contact');
      if (data.details) {
        console.log('Error details:', data.details);
      }
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
}

testContactCreation();
