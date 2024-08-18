const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');


const url_findcourse = 'https://wd10.myworkday.com/ubc/d/task/1422$5132.htmld';

// Add more course levels and school terms if necessary
const courseLevels = [
    { label: '100 Level', directory: '100-Level' },
    { label: '200 Level', directory: '200-Level' },
    { label: '300 Level', directory: '300-Level' },
    { label: '400 Level', directory: '400-Level' }
];

const schoolTerms = [
    { label: 'Winter Term 1 (UBC-V)', directory: 'WinterTerm_1' },
    { label: 'Winter Term 2 (UBC-V)', directory: 'WinterTerm_2' },
    // { label: 'Summer Session (UBC-V)', directory: 'SummerSession' } // 2024-25 Summer Session is not available for now
];

function extractCourseInfo(jsonResponse) {
    let listItems = [];
    
    if (jsonResponse.children && jsonResponse.children[0] && jsonResponse.children[0].listItems) {
        listItems = jsonResponse.children[0].listItems;
    } else if (jsonResponse.body && jsonResponse.body.children && jsonResponse.body.children[0] && jsonResponse.body.children[0].listItems) {
        listItems = jsonResponse.body.children[0].listItems;
    } else {
        console.warn("Unable to find listItems in the provided JSON structure.");
        return [];
    }

    return listItems.map((course, index) => {
        let courseInfo = {};

        if (course.title && course.title.instances && course.title.instances[0]) {
            courseInfo['Course Section'] = course.title.instances[0].text;
        } else {
            courseInfo['Course Section'] = "Unknown Course Name";
        }

        if (course.subtitles) {
            course.subtitles.forEach(subtitle => {
                if (subtitle.instances && subtitle.instances[0]) {
                    const label = subtitle.label;
                    const value = subtitle.instances[0].text;
                    courseInfo[label] = value;
                }
            });
        }

        if (course.detailResultFields) {
            course.detailResultFields.forEach(field => {
                if (field.value) {
                    courseInfo[field.label] = field.value;
                }
            });
        }

        return courseInfo;
    })
}

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        userDataDir: './User Data'
    });

    for (const term of schoolTerms) {
        for (const level of courseLevels) {
            const page = await browser.newPage();
            await page.goto(url_findcourse);
            await page.waitForNavigation();

            // Login to Workday if necessary (usually in the first run)
            if (await page.$('#username') !== null && await page.$('#password') !== null) {
                await page.type('#username', 'YOUR_USERNAME'); // Change to your UBC CWL username
                await page.type('#password', 'YOUR_PASSWORD'); // Change to your UBC CWL password
                await page.click('button[type="submit"]');
                await page.waitForNavigation();
            } else {
                console.log('Username or password field not found, skipping login.');
            }

            await page.waitForSelector('span[data-uxi-element-id="promptIcon-ExternalField146_44940PromptQualifier1"]');
            await page.click('span[data-uxi-element-id="promptIcon-ExternalField146_44940PromptQualifier1"]');

            await page.waitForSelector('div[data-automation-label="Future Periods"]');
            await page.click('div[data-automation-label="Future Periods"]');

            await page.waitForSelector('div[data-automation-label="2024-25 UBC-V Academic Year"]');
            await page.click('div[data-automation-label="2024-25 UBC-V Academic Year"]');

            await page.waitForSelector('input[data-automation-id="checkboxPanel"]');
            await page.click(`div[data-automation-label*="${term.label}"]`);

            await page.mouse.click(100, 200);
            await page.waitForSelector('span[data-uxi-multiselect-id="ExternalField146_44944PromptQualifier1--uid4"]');
            await page.click('span[data-uxi-multiselect-id="ExternalField146_44944PromptQualifier1--uid4"]');

            await page.waitForSelector('div[data-automation-label="Undergraduate"]');
            await page.click('div[data-automation-label="Undergraduate"]');

            await page.click('button[data-automation-id="wd-CommandButton_uic_okButton"]');
            await page.waitForNavigation();

            const directoryPath = path.join(__dirname, 'CourseData', '2024-25', term.directory, level.directory);
            if (!fs.existsSync(directoryPath)) {
                fs.mkdirSync(directoryPath, { recursive: true });
                console.log(`Directory created at ${directoryPath}`);
            } else {
                console.log(`Directory already exists at ${directoryPath}`);
            }

            let fileCounter = 0;
            let parsedFileCounter = 0;
            page.on('response', async (response) => {
                const url = response.url();

                if (url.includes('.htmld')) {
                    const jsonResponse = await response.json();
                    const filePath = path.join(directoryPath, `response_${fileCounter++}.json`);
                    fs.writeFileSync(filePath, JSON.stringify(jsonResponse, null, 2));
                    console.log(`Saved response to ${filePath}`);

                    const courseInfo = extractCourseInfo(jsonResponse);
                    console.log(courseInfo);

                    const parsedFilePath = path.join(directoryPath, `parsed_response_${parsedFileCounter++}.json`);
                    fs.writeFileSync(parsedFilePath, JSON.stringify(courseInfo, null, 2));
                    console.log(`Saved parsed response to ${parsedFilePath}`);
                }
            });

            await page.waitForSelector(`div[title="Course Level :: ${level.label}"]`);
            await page.click(`div[title="Course Level :: ${level.label}"]`);
            await new Promise(resolve => setTimeout(resolve, 10000));

            let previousHeight;
            while (true) {
                previousHeight = await page.evaluate('document.body.scrollHeight');
                await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
                await new Promise(resolve => setTimeout(resolve, 1000));

                const newHeight = await page.evaluate('document.body.scrollHeight');
                if (newHeight === previousHeight) {
                    break;
                }
            }
        }
    }

    await browser.close();
})();
