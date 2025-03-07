async function generate_image_with_flux_ultra(params, userSettings) {
  const { prompt } = params;
  const { fal_ai_api_key, num_images = 1, output_format = "jpeg", aspect_ratio = "16:9", enable_safety_checker = "true", raw = "false", safety_tolerance = "2" } = userSettings;

  const requestBody = {
    prompt,
    num_images: parseInt(num_images),
    output_format,
    aspect_ratio,
    enable_safety_checker: enable_safety_checker === "true",
    raw: raw === "true",
    safety_tolerance
  };

  try {
    const submitResponse = await fetch("https://queue.fal.run/fal-ai/flux-pro/v1.1-ultra", {
      method: "POST",
      headers: {
        "Authorization": `Key ${fal_ai_api_key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!submitResponse.ok) {
      const errorBody = await submitResponse.text();
      throw new Error(`Fal.ai API request failed: Status: ${submitResponse.status}, StatusText: ${submitResponse.statusText}, Body: ${errorBody}`);
    }

    const { request_id } = await submitResponse.json();
    if (!request_id) {
      throw new Error("Did not receive a request_id from Fal.ai API.");
    }

    let result = null;
    const maxAttempts = 60;
    const pollInterval = 5000;
    for (let attempts = 0; attempts < maxAttempts && !result; attempts++) {
      const statusResponse = await fetch(`https://queue.fal.run/fal-ai/flux-pro/requests/${request_id}/status`, {
        headers: {
          "Authorization": `Key ${fal_ai_api_key}`
        }
      });

      if (!statusResponse.ok) {
        const errorBody = await statusResponse.text();
        throw new Error(`Fal.ai status check failed: Status: ${statusResponse.status}, StatusText: ${statusResponse.statusText}, Body: ${errorBody}`);
      }

      const statusJson = await statusResponse.json();
      if (statusJson.status === "COMPLETED") {
        const resultResponse = await fetch(`https://queue.fal.run/fal-ai/flux-pro/requests/${request_id}`, {
          headers: {
            "Authorization": `Key ${fal_ai_api_key}`
          }
        });

        if (!resultResponse.ok) {
          const errorBody = await resultResponse.text();
          throw new Error(`Fal.ai result fetch failed: Status: ${resultResponse.status}, StatusText: ${resultResponse.statusText}, Body: ${errorBody}`);
        }

        result = await resultResponse.json();
        break;
      } else if (statusJson.status === "FAILED") {
        throw new Error(`Fal.ai request failed: ${statusJson.error}`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    if (!result) {
      throw new Error(`Fal.ai request timed out after ${maxAttempts} attempts.`);
    }

    let markdownOutput = "";
    if (result.images?.length > 0) {
      for (let i = 0; i < result.images.length; i++) {
        const image = result.images[i];
        const altText = prompt?.substring(0, 100) || "Generated Image";
        markdownOutput += `![${altText + (result.images.length > 1 ? ` (Image ${i + 1} of ${result.images.length})` : "")}](${image.url})\n\n`;
      }
      return markdownOutput;
    } else {
      return "No images were generated.";
    }

  } catch (error) {
    return `**Error:** ${error.message}`;
  }
}
