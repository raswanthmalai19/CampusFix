// const { BlobServiceClient } = require('@azure/storage-blob');

// // Your connection string
// const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

// async function listBlobs() {
//     try {
//         console.log('🔍 Connecting to Azure Blob Storage...');
        
//         const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
//         const containerClient = blobServiceClient.getContainerClient("campusfix");
        
//         console.log('📂 Listing files in container: campusfix');
//         console.log('=' .repeat(50));
        
//         let count = 0;
//         let totalSize = 0;
        
//         for await (const blob of containerClient.listBlobsFlat()) {
//             count++;
//             const sizeMB = (blob.properties.contentLength / (1024 * 1024)).toFixed(2);
//             totalSize += blob.properties.contentLength;
            
//             console.log(`📄 ${count}. ${blob.name}`);
//             console.log(`   📏 Size: ${sizeMB} MB`);
//             console.log(`   📅 Modified: ${blob.properties.lastModified}`);
//             console.log(`   🔗 URL: https://campusfixstorage.blob.core.windows.net/campusfix/${blob.name}`);
//             console.log('---');
//         }
        
//         const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
//         console.log(`📊 Total: ${count} files, ${totalSizeMB} MB`);
        
//     } catch (error) {
//         console.error('❌ Error:', error.message);
//     }
// }

// // Run the function
// listBlobs();

const { BlobServiceClient } = require('@azure/storage-blob');

// Replace with your two connection strings
const connectionString1 = process.env.AZURE_STORAGE_CONNECTION_STRING;
const connectionString2 = process.env.AZURE_STORAGE_CONNECTION_STRING_2;

async function testConnectionString(connString, name) {
    try {
        console.log(`\n🧪 Testing ${name}...`);
        
        const blobServiceClient = BlobServiceClient.fromConnectionString(connString);
        
        // Extract account name from connection string for verification
        const accountNameMatch = connString.match(/AccountName=([^;]+)/);
        const accountName = accountNameMatch ? accountNameMatch[1] : 'Unknown';
        
        console.log(`   Account Name: ${accountName}`);
        
        const containerClient = blobServiceClient.getContainerClient("campusfix");
        
        // Test container access
        const exists = await containerClient.exists();
        console.log(`   Container exists: ${exists}`);
        
        if (exists) {
            // List files to verify it's the right container
            let fileCount = 0;
            const files = [];
            for await (const blob of containerClient.listBlobsFlat()) {
                fileCount++;
                files.push(blob.name);
                if (fileCount <= 3) { // Show first 3 files
                    console.log(`   📄 ${blob.name} (${blob.properties.contentLength} bytes)`);
                }
            }
            console.log(`   Total files: ${fileCount}`);
            
            // Verify this is YOUR container by checking for known files
            const hasImagesJpeg = files.includes('images.jpeg');
            console.log(`   Has images.jpeg: ${hasImagesJpeg}`);
            
            return {
                success: true,
                accountName: accountName,
                fileCount: fileCount,
                hasImagesJpeg: hasImagesJpeg
            };
        } else {
            console.log(`   ❌ Container 'campusfix' not found in this account`);
            return { success: false, error: 'Container not found' };
        }
        
    } catch (error) {
        console.log(`   ❌ Failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function compareConnectionStrings() {
    console.log('🔗 Comparing both connection strings...');
    console.log('=========================================');
    
    const results = [];
    
    // Test first connection string
    const result1 = await testConnectionString(connectionString1, "Connection String 1");
    results.push({...result1, name: "Connection String 1"});
    
    // Test second connection string  
    const result2 = await testConnectionString(connectionString2, "Connection String 2");
    results.push({...result2, name: "Connection String 2"});
    
    console.log('\n📊 COMPARISON RESULTS:');
    console.log('=====================');
    
    const workingConnections = results.filter(r => r.success);
    const brokenConnections = results.filter(r => !r.success);
    
    if (workingConnections.length > 0) {
        console.log('✅ WORKING CONNECTION STRINGS:');
        workingConnections.forEach(conn => {
            console.log(`   ${conn.name}:`);
            console.log(`     - Account: ${conn.accountName}`);
            console.log(`     - Files: ${conn.fileCount}`);
            console.log(`     - Has your files: ${conn.hasImagesJpeg}`);
        });
    }
    
    // Determine which one to use
    if (workingConnections.length === 1) {
        const best = workingConnections[0];
        console.log(`\n💡 USE: ${best.name} (Account: ${best.accountName})`);
    } else if (workingConnections.length > 1) {
        // Prefer the one that has your actual files
        const withFiles = workingConnections.filter(conn => conn.hasImagesJpeg);
        if (withFiles.length > 0) {
            console.log(`\n💡 USE: ${withFiles[0].name} (Has your actual files)`);
        } else {
            console.log(`\n💡 USE: ${workingConnections[0].name} (Both work, choose any)`);
        }
    }
}

compareConnectionStrings();