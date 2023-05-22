"use strict";

const catalyst = require("zcatalyst-sdk-node");
const axios = require("axios").default;
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: "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",
});

const openai = new OpenAIApi(configuration);

const ROBOT_ID = "f79cc59b-3f46-4d37-987e-4faed11137c5";
const API_KEY =
  "7131fe75-0f62-423d-9cd1-d0927d6e2fc1:afaa0959-82e0-473c-9634-cba1eae47bc7";
// const WEBHOOkURL = "https://hooks.zapier.com/hooks/catch/15287799/364japk/";

// Function to remove special characters and single quotes from a string
function cleanString(str) {
  if (str) {
    return str.replace(/'/g, "''");
  }
}

const pushBrowseAItoDatastore = async ({
  item,
  table,
  updateTile = false,
  updatePreview = false,
  zcql = null,
}) => {
  let createTitle = `Re-write this title to be more verbose. Title: ${item.Title}`;
  let createContent = `Re-write this content to be more verbose. Content: ${item.Preview}`;
  let titleParam = cleanString(item?.Title);
  let previewParam = cleanString(item?.Preview);

  if (updateTile) {
    const TitleResponse = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: createTitle,
      n: 1,
      temperature: 0.5,
      max_tokens: 100,
    });

    let newTitle = TitleResponse.data.choices[0].text?.replace(/^\n\n/, "");

    let updateQuery = `UPDATE ZohoReleaseNotes SET title = '${cleanString(
      newTitle
    )}', title_browseai = '${titleParam}' WHERE preview_browseai = '${previewParam}'`;

    let zcqlPromise = zcql.executeZCQLQuery(updateQuery);

    zcqlPromise.then((queryResult) => {
      console.log("New BrowseAI Title Updated...", titleParam);
      // axios
      //   .post(WEBHOOkURL, queryResult?.ZohoReleaseNotes)
      //   .then((response) => {
      //     console.log("Webhook sent successfully.", response);
      //   })
      //   .catch((error) => {
      //     console.error("Error sending webhook:", error);
      //   });
    });
  } else if (updatePreview) {
    const contentResponse = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: createContent,
      n: 1,
      temperature: 0.5,
      max_tokens: 250,
    });

    let newPreview = contentResponse?.data?.choices[0]?.text?.replace(
      /^\n\n/,
      ""
    );

    let updateQuery = `UPDATE ZohoReleaseNotes SET preview = '${cleanString(
      newPreview
    )}', preview_browseai = '${previewParam}' WHERE title_browseai = '${titleParam}'`;

    let zcqlPromise = zcql.executeZCQLQuery(updateQuery);
    zcqlPromise.then((queryResult) => {
      console.log("New BrowseAI Preview Updated...", previewParam);
      // axios
      //   .post(WEBHOOkURL, queryResult?.ZohoReleaseNotes)
      //   .then((response) => {
      //     console.log("Webhook sent successfully.", response);
      //   })
      //   .catch((error) => {
      //     console.error("Error sending webhook:", error);
      //   });
    });
  } else {
    const TitleResponse = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: createTitle,
      n: 1,
      temperature: 0.5,
      max_tokens: 100,
    });

    const contentResponse = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: createContent,
      n: 1,
      temperature: 0.5,
      max_tokens: 250,
    });

    const rowData = {
      title: TitleResponse?.data?.choices[0]?.text.replace(/^\n\n/, ""),
      preview: contentResponse?.data?.choices[0]?.text?.replace(/^\n\n/, ""),
      position: item.Position,
      title_browseai: item.Title,
      preview_browseai: item.Preview,
      type: item.Type,
      status: item._STATUS,
    };

    // axios
    //   .post(WEBHOOkURL, rowData)
    //   .then((response) => {
    //     console.log("Webhook sent successfully.", response);
    //   })
    //   .catch((error) => {
    //     console.error("Error sending webhook:", error);
    //   });

    // console.log("title...", removeSpecialCharacters(item.Title));

    return table.insertRow(rowData);
  }
};

module.exports = async (_cronDetails, context) => {
  try {
    const tableName = "ZohoReleaseNotes";
    const catalystApp = catalyst.initialize(context);
    const zcql = catalystApp.zcql();
    const datastoreAPI = catalystApp.datastore();
    const table = datastoreAPI.table(tableName);
    let pageNumber = 1;
    const delay = 1000; // Delay in milliseconds between each API request

    while (true) {
      const recordsOptions = {
        method: "GET",
        url: `https://api.browse.ai/v2/robots/${ROBOT_ID}/tasks`,
        headers: {
          Authorization: `Bearer ${API_KEY}`,
        },
        params: {
          page: pageNumber,
        },
      };

      const response = await axios(recordsOptions);
      const robotTasks = response?.data?.result?.robotTasks;
      for (const task of robotTasks?.items ?? []) {
        const features = task.capturedLists?.Features ?? [];
        for (const item of features) {
          if (item?.Title && item?.Preview) {
            let titleParam = cleanString(item?.Title);
            let previewParam = cleanString(item?.Preview);

            try {
              // Record Search Query
              let recordSearchQuery = `SELECT title_browseai, preview_browseai FROM ZohoReleaseNotes WHERE title_browseai = '${titleParam}' AND preview_browseai = '${previewParam}'`;
              let recordSearchResult = await zcql.executeZCQLQuery(
                recordSearchQuery
              );

              if (recordSearchResult.length > 0) {
                let existingRecord = recordSearchResult[0];
                console.log(
                  "Record is not changed and already exists:",
                  existingRecord
                );
                continue; // Skip to the next iteration of the loop
              }

              // Title Search Query
              let titleSearchQuery = `SELECT title_browseai, preview_browseai FROM ZohoReleaseNotes WHERE title_browseai != '${titleParam}' AND preview_browseai = '${previewParam}'`;
              let titleSearchResult = await zcql.executeZCQLQuery(
                titleSearchQuery
              );
              if (titleSearchResult.length > 0) {
                console.log("Title changed....");
                await pushBrowseAItoDatastore({
                  item,
                  table,
                  updateTile: true,
                  zcql,
                });
                continue; // Skip to the next iteration of the loop
              }

              // Preview Search Query
              let previewSearchQuery = `SELECT title_browseai, preview_browseai FROM ZohoReleaseNotes WHERE title_browseai = '${titleParam}' AND preview_browseai != '${previewParam}'`;
              let previewSearchResult = await zcql.executeZCQLQuery(
                previewSearchQuery
              );
              if (previewSearchResult.length > 0) {
                console.log("Preview changed....");
                await pushBrowseAItoDatastore({
                  item,
                  table,
                  updatePreview: true,
                  zcql,
                });
                continue; // Skip to the next iteration of the loop
              }

              // Add New Record Query
              console.log("Adding new record....", item);
              await pushBrowseAItoDatastore({
                item,
                table,
              });
            } catch (err) {
              console.log("Query error...", err);
              console.log("value....", {
                Title: item?.Title,
                Preview: item?.Preview,
              });
            }

            // Delay between API requests
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      pageNumber++;

      if (!robotTasks.hasMore) {
        context.closeWithSuccess();
        break;
      }
    }
  } catch (err) {
    console.log("error.............", err);
    context.closeWithFailure();
  }
};
